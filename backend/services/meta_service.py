import uuid
import json
from datetime import datetime
from typing import List
from anthropic import AsyncAnthropic

from core.config import get_settings
from models.meta_comment import MetaComment, MetaCommentSource


class MetaService:
    """Synthesizes individual persona comments into unified meta-review feedback."""

    def __init__(self):
        self.settings = get_settings()

    def _group_comments_by_location(self, comments: list[dict]) -> list[dict]:
        """Group comments that target overlapping or adjacent line ranges."""
        if not comments:
            return []

        sorted_comments = sorted(comments, key=lambda c: (c["start_line"], c["end_line"]))
        groups = []
        current_group = {
            "start_line": sorted_comments[0]["start_line"],
            "end_line": sorted_comments[0]["end_line"],
            "comments": [sorted_comments[0]],
        }

        for comment in sorted_comments[1:]:
            # Merge if overlapping or adjacent (within 2 lines)
            if comment["start_line"] <= current_group["end_line"] + 2:
                current_group["end_line"] = max(current_group["end_line"], comment["end_line"])
                current_group["comments"].append(comment)
            else:
                groups.append(current_group)
                current_group = {
                    "start_line": comment["start_line"],
                    "end_line": comment["end_line"],
                    "comments": [comment],
                }

        groups.append(current_group)
        return groups

    async def synthesize(self, comments: list[dict]) -> List[MetaComment]:
        """Take all persona comments and synthesize into meta-review comments."""
        if not comments:
            return []

        groups = self._group_comments_by_location(comments)

        # Build the prompt for Claude
        groups_text = ""
        for i, group in enumerate(groups):
            groups_text += f"\n--- GROUP {i} (lines {group['start_line']+1}-{group['end_line']+1}) ---\n"
            for c in group["comments"]:
                groups_text += f"[{c['persona_name']}]: {c['content']}\n"

        prompt = f"""You are a meta-reviewer producing an executive summary of feedback from multiple AI personas.

Your output is a triage dashboard — not a second review. Users drill down into individual comments for details. Your job: tell them what matters, what to fix, and whether this document is ready.

Rules:
- MERGE similar criticisms across ALL groups into single findings. "3 personas flagged unclear terminology in sections 2-4" > repeating each one.
- ONE sentence per finding. Two max if critical.
- Total output: aim for 3-7 findings for the entire document. Fewer is better.
- Be clinical: verdict + location + action. No elaboration, no teaching.
- Skip anything that's just style preference or nitpicking.
- Group findings by theme (security, clarity, structure) not by location.

Categories: security, technical, clarity, structure, accessibility, style
Priorities: critical, high, medium, low

JSON array. Each element:
- "group_index": -1 (these are document-level findings, not tied to a single group)
- "content": the finding (1 sentence, clinical)
- "category": category
- "priority": priority
- "contributing_personas": persona names involved
- "line_ranges": array of [start, end] pairs this finding covers (for highlighting)

Return ONLY the JSON array.

{groups_text}"""

        client = AsyncAnthropic(api_key=self.settings.anthropic_api_key)

        try:
            message = await client.messages.create(
                model="claude-sonnet-4-5-20250929",
                max_tokens=2048,
                messages=[{"role": "user", "content": prompt}],
            )

            response_text = message.content[0].text.strip()
            # Strip markdown code fences if present (```json ... ``` or ``` ... ```)
            if response_text.startswith("```"):
                # Remove opening fence line
                response_text = response_text.split("\n", 1)[1] if "\n" in response_text else response_text[3:]
                # Remove closing fence
                response_text = response_text.rsplit("```", 1)[0].strip()

            synthesis = json.loads(response_text)
        except Exception as e:
            import traceback
            print(f"[META] Synthesis failed: {e}")
            traceback.print_exc()
            # Fallback: create simple meta-comments per group without synthesis
            return self._fallback_synthesis(groups)

        # Build a flat list of all comments for source matching
        all_comments = []
        for group in groups:
            all_comments.extend(group["comments"])

        meta_comments = []
        for item in synthesis:
            contributing_names = set(item.get("contributing_personas", []))

            # Collect sources from all comments matching contributing personas
            sources = []
            seen_ids = set()
            for c in all_comments:
                if c["persona_name"] in contributing_names and c.get("id") not in seen_ids:
                    sources.append(MetaCommentSource(
                        persona_id=c["persona_id"],
                        persona_name=c["persona_name"],
                        persona_color=c["persona_color"],
                        original_content=c["content"],
                    ))
                    seen_ids.add(c.get("id"))

            # Determine line range from line_ranges field or fall back to group
            line_ranges = item.get("line_ranges", [])
            if line_ranges:
                start_line = min(r[0] for r in line_ranges) - 1  # Convert to 0-indexed
                end_line = max(r[1] for r in line_ranges) - 1
            else:
                group_idx = item.get("group_index", 0)
                if 0 <= group_idx < len(groups):
                    start_line = groups[group_idx]["start_line"]
                    end_line = groups[group_idx]["end_line"]
                else:
                    start_line = 0
                    end_line = 0

            meta_comments.append(MetaComment(
                id=str(uuid.uuid4())[:8],
                content=item.get("content", ""),
                start_line=start_line,
                end_line=end_line,
                sources=sources,
                category=item.get("category", "clarity"),
                priority=item.get("priority", "medium"),
                created_at=datetime.utcnow(),
            ))

        return meta_comments

    def _fallback_synthesis(self, groups: list[dict]) -> List[MetaComment]:
        """Simple fallback when Claude synthesis fails."""
        meta_comments = []
        for group in groups:
            contents = [c["content"] for c in group["comments"]]
            merged = " | ".join(contents)
            sources = [
                MetaCommentSource(
                    persona_id=c["persona_id"],
                    persona_name=c["persona_name"],
                    persona_color=c["persona_color"],
                    original_content=c["content"],
                )
                for c in group["comments"]
            ]
            meta_comments.append(MetaComment(
                id=str(uuid.uuid4())[:8],
                content=merged,
                start_line=group["start_line"],
                end_line=group["end_line"],
                sources=sources,
                category="clarity",
                priority="medium",
                created_at=datetime.utcnow(),
            ))
        return meta_comments
