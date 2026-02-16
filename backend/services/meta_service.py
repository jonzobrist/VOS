import uuid
import json
import logging
from datetime import datetime
from typing import List
from anthropic import AsyncAnthropic

logger = logging.getLogger(__name__)

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

        # Filter out failed review comments before synthesis
        valid_comments = [c for c in comments if not c.get("content", "").startswith("Review failed:")]
        if not valid_comments:
            return []

        groups = self._group_comments_by_location(valid_comments)

        # Build the prompt for Claude
        groups_text = ""
        for i, group in enumerate(groups):
            groups_text += f"\n--- GROUP {i} (lines {group['start_line']+1}-{group['end_line']+1}) ---\n"
            for c in group["comments"]:
                groups_text += f"[{c['persona_name']}]: {c['content']}\n"

        prompt = f"""You are a meta-reviewer synthesizing feedback from multiple AI personas reviewing a document.

Below are groups of comments organized by their location in the document. Each group contains comments from different personas that target the same or overlapping sections.

Your job:
1. For each group, synthesize the comments into ONE clear, actionable meta-comment
2. De-duplicate similar feedback — if multiple reviewers say the same thing, merge into one point
3. Preserve unique insights from each persona
4. Assign a category: structure, clarity, technical, security, or accessibility
5. Assign a priority: critical, high, medium, or low

Respond with a JSON array. Each element must have:
- "group_index": the group number (0-indexed)
- "content": the synthesized feedback (2-4 sentences, clear and actionable)
- "category": one of "structure", "clarity", "technical", "security", "accessibility"
- "priority": one of "critical", "high", "medium", "low"
- "contributing_personas": array of persona names that contributed to this synthesis

IMPORTANT: Return ONLY the JSON array, no markdown formatting, no code blocks, no extra text.

{groups_text}"""

        client = AsyncAnthropic(api_key=self.settings.anthropic_api_key)

        try:
            message = await client.messages.create(
                model="claude-sonnet-4-5-20250929",
                max_tokens=2048,
                messages=[{"role": "user", "content": prompt}],
            )

            response_text = message.content[0].text.strip()
            # Strip markdown code fences if present
            if response_text.startswith("```"):
                response_text = response_text.split("\n", 1)[1]
                if response_text.endswith("```"):
                    response_text = response_text[:-3].strip()

            synthesis = json.loads(response_text)
        except Exception as e:
            logger.warning(f"Meta synthesis LLM call failed, using fallback: {e}")
            return self._fallback_synthesis(groups)

        meta_comments = []
        for item in synthesis:
            group_idx = item.get("group_index", 0)
            if group_idx >= len(groups):
                continue
            group = groups[group_idx]

            contributing_names = set(item.get("contributing_personas", []))
            sources = []
            for c in group["comments"]:
                if not contributing_names or c["persona_name"] in contributing_names:
                    sources.append(MetaCommentSource(
                        persona_id=c["persona_id"],
                        persona_name=c["persona_name"],
                        persona_color=c["persona_color"],
                        original_content=c["content"],
                    ))

            # If no sources matched by name, include all from the group
            if not sources:
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
                content=item.get("content", ""),
                start_line=group["start_line"],
                end_line=group["end_line"],
                sources=sources,
                category=item.get("category", "clarity"),
                priority=item.get("priority", "medium"),
                created_at=datetime.utcnow(),
            ))

        return meta_comments

    def _fallback_synthesis(self, groups: list[dict]) -> List[MetaComment]:
        """Structured fallback when Claude synthesis fails — summarizes per group."""
        meta_comments = []
        for group in groups:
            sources = [
                MetaCommentSource(
                    persona_id=c["persona_id"],
                    persona_name=c["persona_name"],
                    persona_color=c["persona_color"],
                    original_content=c["content"],
                )
                for c in group["comments"]
            ]

            # Build a readable summary instead of pipe-concatenation
            persona_count = len(set(c["persona_name"] for c in group["comments"]))
            if persona_count == 1:
                # Single persona — just use their comment directly
                content = group["comments"][0]["content"]
            else:
                # Multiple personas — create a bullet-style summary
                points = []
                for c in group["comments"]:
                    points.append(f"{c['persona_name']}: {c['content']}")
                content = f"{persona_count} reviewers commented on this section. " + points[0]
                if len(points) > 1:
                    content += f" Additionally, {points[1].lower()}"

            # Infer priority from keywords
            combined_text = " ".join(c["content"].lower() for c in group["comments"])
            if any(w in combined_text for w in ["critical", "vulnerability", "security risk", "urgent"]):
                priority = "critical"
            elif any(w in combined_text for w in ["important", "significant", "high"]):
                priority = "high"
            elif any(w in combined_text for w in ["minor", "nit", "optional", "consider"]):
                priority = "low"
            else:
                priority = "medium"

            # Infer category from persona types
            persona_ids = set(c.get("persona_id", "") for c in group["comments"])
            if "security-reviewer" in persona_ids:
                category = "security"
            elif "technical-architect" in persona_ids:
                category = "technical"
            elif "accessibility-advocate" in persona_ids:
                category = "accessibility"
            elif "casual-reader" in persona_ids:
                category = "clarity"
            else:
                category = "structure"

            meta_comments.append(MetaComment(
                id=str(uuid.uuid4())[:8],
                content=content,
                start_line=group["start_line"],
                end_line=group["end_line"],
                sources=sources,
                category=category,
                priority=priority,
                created_at=datetime.utcnow(),
            ))
        return meta_comments
