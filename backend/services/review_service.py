import asyncio
import uuid
import re
from datetime import datetime
from typing import AsyncGenerator, List, Optional
from anthropic import AsyncAnthropic

from models.persona import Persona, PersonaTone
from models.comment import Comment, CommentAnchor
from core.config import get_settings

PERSONAS = [
    Persona(
        id="devils-advocate",
        name="Devil's Advocate",
        description="Challenges every assumption and plays contrarian",
        system_prompt="""You are a ruthless Devil's Advocate. Your purpose is to stress-test every claim in this document.

Your approach:
- Challenge EVERY assumption, especially the ones that seem obvious
- Ask "what if the opposite is true?"
- Find the weakest argument and attack it relentlessly
- Point out what the author conveniently ignores
- Question whether the evidence actually supports the conclusions
- Identify circular reasoning, survivorship bias, and cherry-picked data

Tone: Sharp, provocative, but intellectually honest. You're not being mean — you're making the work stronger by finding its cracks before someone else does.

Keep each comment to 2-3 sentences. Be specific about what you're challenging and why.""",
        tone=PersonaTone.DEVIL_ADVOCATE,
        focus_areas=["logic", "assumptions", "evidence", "counterarguments"],
        color="#ef4444"
    ),
    Persona(
        id="supportive-editor",
        name="Supportive Editor",
        description="Finds strengths and encourages while improving",
        system_prompt="""You are a warm, experienced editor who genuinely wants this work to succeed.

Your approach:
- Lead with what's working well — be specific about strong passages
- When suggesting changes, frame them as opportunities, not failures
- Notice craft: good transitions, vivid examples, clear structure
- Suggest where to expand on promising ideas
- Identify the document's core message and help sharpen it
- Offer specific rewrites for weak sentences, not just "this could be better"

Tone: Encouraging and constructive. Like a mentor who sees potential and helps realize it. Never condescending.

Keep each comment to 2-3 sentences. Be genuine — don't manufacture praise.""",
        tone=PersonaTone.SUPPORTIVE,
        focus_areas=["strengths", "potential", "encouragement", "craft"],
        color="#22c55e"
    ),
    Persona(
        id="technical-architect",
        name="Technical Architect",
        description="Evaluates technical design, scalability, and patterns",
        system_prompt="""You are a principal software architect with 20+ years of experience reviewing technical documents.

Your approach:
- Evaluate architectural decisions and their long-term implications
- Check for scalability concerns, performance bottlenecks, single points of failure
- Assess whether the right design patterns are being used (or misused)
- Look for missing error handling, edge cases, and failure modes
- Question technology choices — are they justified?
- Check if the system design matches the stated requirements

Tone: Precise and technical. You speak in specifics, not generalities. Reference industry standards and best practices when relevant.

Keep each comment to 2-3 sentences. Be actionable — say what should change and why.""",
        tone=PersonaTone.TECHNICAL,
        focus_areas=["architecture", "scalability", "performance", "design patterns"],
        color="#3b82f6"
    ),
    Persona(
        id="casual-reader",
        name="Casual Reader",
        description="Represents the confused layperson perspective",
        system_prompt="""You are an intelligent but non-expert reader encountering this document for the first time. You have no domain expertise.

Your approach:
- Flag every moment of confusion: "I don't understand what X means"
- Note where you got bored or lost the thread
- Ask the "dumb questions" that experts forget to answer
- Point out jargon that isn't defined
- Say when an example would help
- Notice when the document assumes knowledge you don't have

Tone: Honest and unashamed. Your confusion is the most valuable feedback. Don't pretend to understand.

Keep each comment to 2-3 sentences. Be specific about exactly where you got lost.""",
        tone=PersonaTone.NEUTRAL,
        focus_areas=["accessibility", "engagement", "confusion", "jargon"],
        color="#eab308"
    ),
    Persona(
        id="security-reviewer",
        name="Security Reviewer",
        description="Hunts for security vulnerabilities and data risks",
        system_prompt="""You are a senior security engineer and threat modeler. Every document is a potential attack surface.

Your approach:
- Identify security vulnerabilities: injection, auth bypass, data exposure, SSRF, etc.
- Check for sensitive data handling: PII, credentials, tokens, API keys
- Evaluate access control assumptions — who can do what?
- Look for missing input validation and trust boundaries
- Consider threat models: who would attack this and how?
- Flag compliance concerns: GDPR, SOC2, HIPAA implications

Tone: Urgent but professional. Security issues are not theoretical — they're bugs waiting to be exploited. Prioritize by severity.

Keep each comment to 2-3 sentences. Classify severity: CRITICAL / HIGH / MEDIUM / LOW.""",
        tone=PersonaTone.CRITICAL,
        focus_areas=["security", "privacy", "authentication", "vulnerabilities", "compliance"],
        color="#f97316"
    ),
    Persona(
        id="accessibility-advocate",
        name="Accessibility Advocate",
        description="Champions inclusive design and universal access",
        system_prompt="""You are an accessibility specialist who ensures content and systems work for everyone.

Your approach:
- Check if the document considers users with disabilities
- Evaluate color contrast, text alternatives, keyboard navigation mentions
- Look for assumptions about user capabilities (vision, hearing, motor, cognitive)
- Check language clarity for non-native speakers and cognitive accessibility
- Identify missing alt text descriptions, ARIA labels, or screen reader considerations
- Ensure the proposed design follows WCAG 2.1 AA standards

Tone: Passionate but practical. Accessibility isn't nice-to-have — it's a requirement. Suggest specific fixes.

Keep each comment to 2-3 sentences. Reference WCAG guidelines when applicable.""",
        tone=PersonaTone.SUPPORTIVE,
        focus_areas=["accessibility", "inclusivity", "WCAG", "usability"],
        color="#8b5cf6"
    ),
    Persona(
        id="executive-summary",
        name="Executive Summarizer",
        description="Distills documents into strategic takeaways",
        system_prompt="""You are a C-suite advisor who translates detailed documents into executive-level insights.

Your approach:
- Identify the 3 most important takeaways
- Flag strategic risks and opportunities the author may not see
- Assess ROI implications and resource requirements
- Note what's missing that a decision-maker would need
- Evaluate whether the document makes a clear ask or recommendation
- Check if success metrics and timelines are defined

Tone: Direct and strategic. No fluff. Think in terms of impact, risk, and priority. Executives have 2 minutes — make it count.

Keep each comment to 2-3 sentences. Focus on what matters for decision-making.""",
        tone=PersonaTone.NEUTRAL,
        focus_areas=["strategy", "ROI", "risk", "decisions", "metrics"],
        color="#06b6d4"
    ),
]


class ReviewService:
    """AI-powered document review with concurrent streaming"""

    def __init__(self):
        self.settings = get_settings()
        self._personas = {p.id: p for p in PERSONAS}

    def get_persona(self, persona_id: str) -> Optional[Persona]:
        return self._personas.get(persona_id)

    def list_personas(self) -> List[Persona]:
        return list(self._personas.values())

    def _parse_document_structure(self, content: str) -> List[dict]:
        """Parse markdown into paragraphs with positions"""
        paragraphs = []
        lines = content.split('\n')
        current_para = []
        start_line = 0

        for i, line in enumerate(lines):
            if line.strip() == '' and current_para:
                paragraphs.append({
                    "text": '\n'.join(current_para),
                    "start_line": start_line,
                    "end_line": i - 1,
                    "index": len(paragraphs)
                })
                current_para = []
                start_line = i + 1
            elif line.strip():
                if not current_para:
                    start_line = i
                current_para.append(line)

        if current_para:
            paragraphs.append({
                "text": '\n'.join(current_para),
                "start_line": start_line,
                "end_line": len(lines) - 1,
                "index": len(paragraphs)
            })

        return paragraphs

    async def _review_with_persona(
        self,
        persona: Persona,
        content: str,
        document_id: str,
        version_hash: str,
        paragraphs: List[dict],
        model: str,
    ) -> List[Comment]:
        """Run a single persona's review and return all comments"""
        client = AsyncAnthropic(api_key=self.settings.anthropic_api_key)

        prompt = f"""Review this document and provide specific, actionable comments.

Document:
---
{content}
---

The document has {len(paragraphs)} paragraphs. For each comment, specify which paragraph (by number, 0-indexed) you're commenting on.
Format each comment as:
[PARAGRAPH X] Your comment here

Be specific and concise. Provide 3-5 comments total, focusing on different parts of the document.
Your comments should reflect your unique perspective and expertise."""

        comments = []
        try:
            async with client.messages.stream(
                model=model,
                max_tokens=1024,
                system=persona.system_prompt,
                messages=[{"role": "user", "content": prompt}]
            ) as stream:
                full_response = ""
                async for text in stream.text_stream:
                    full_response += text

            comment_pattern = r'\[PARAGRAPH\s*(\d+)\]\s*(.+?)(?=\[PARAGRAPH|\Z)'
            matches = re.findall(comment_pattern, full_response, re.DOTALL)

            for para_num, comment_text in matches:
                para_idx = int(para_num)
                if para_idx < len(paragraphs):
                    para = paragraphs[para_idx]
                    comment = Comment(
                        id=str(uuid.uuid4())[:8],
                        content=comment_text.strip(),
                        anchor=CommentAnchor(
                            file_path="document.md",
                            start_line=para["start_line"],
                            end_line=para["end_line"]
                        ),
                        persona_id=persona.id,
                        persona_name=persona.name,
                        persona_color=persona.color,
                        document_id=document_id,
                        version_hash=version_hash,
                        created_at=datetime.utcnow()
                    )
                    comments.append(comment)
        except Exception as e:
            comments.append(Comment(
                id=str(uuid.uuid4())[:8],
                content=f"Review failed: {str(e)}",
                anchor=CommentAnchor(file_path="document.md", start_line=0, end_line=0),
                persona_id=persona.id,
                persona_name=persona.name,
                persona_color=persona.color,
                document_id=document_id,
                version_hash=version_hash,
                created_at=datetime.utcnow()
            ))

        return comments

    async def review_document(
        self,
        document_id: str,
        content: str,
        version_hash: str,
        persona_ids: Optional[List[str]] = None,
        model: str = "claude-sonnet-4-5-20250929"
    ) -> AsyncGenerator[dict, None]:
        """Stream review events: persona status updates + comments as they arrive"""

        personas = [self._personas[pid] for pid in (persona_ids or self._personas.keys())
                    if pid in self._personas]

        paragraphs = self._parse_document_structure(content)

        # Emit initial status
        for persona in personas:
            yield {
                "type": "persona_status",
                "persona_id": persona.id,
                "persona_name": persona.name,
                "persona_color": persona.color,
                "status": "queued"
            }

        # Run all personas concurrently
        async def run_persona(persona: Persona):
            return persona, await self._review_with_persona(
                persona, content, document_id, version_hash, paragraphs, model
            )

        tasks = [asyncio.create_task(run_persona(p)) for p in personas]

        # Mark all as running
        for persona in personas:
            yield {
                "type": "persona_status",
                "persona_id": persona.id,
                "persona_name": persona.name,
                "persona_color": persona.color,
                "status": "running"
            }

        all_comments = []

        for coro in asyncio.as_completed(tasks):
            persona, comments = await coro
            all_comments.extend(comments)

            # Emit completed status
            yield {
                "type": "persona_status",
                "persona_id": persona.id,
                "persona_name": persona.name,
                "persona_color": persona.color,
                "status": "completed"
            }

            # Emit each comment
            for comment in comments:
                yield {
                    "type": "comment",
                    "comment": comment.model_dump(mode="json")
                }

        yield {"type": "done", "total_comments": len(all_comments)}
