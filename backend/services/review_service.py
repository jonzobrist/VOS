import asyncio
import uuid
import re
from datetime import datetime
from typing import AsyncGenerator, List, Optional
from anthropic import AsyncAnthropic

from models.persona import Persona, PersonaTone
from models.comment import Comment, CommentAnchor
from core.config import get_settings

# Default personas
DEFAULT_PERSONAS = [
    Persona(
        id="devils-advocate",
        name="Devil's Advocate",
        description="Challenges every assumption and plays contrarian",
        system_prompt="""You are a Devil's Advocate reviewer. Your job is to challenge every claim, 
assumption, and conclusion in the document. Ask uncomfortable questions. Point out logical flaws.
Be skeptical but constructive - your goal is to strengthen the work by finding weaknesses.
Keep comments concise and pointed.""",
        tone=PersonaTone.CRITICAL,
        focus_areas=["logic", "assumptions", "evidence"],
        color="#ef4444"  # Red
    ),
    Persona(
        id="supportive-editor",
        name="Supportive Editor",
        description="Encourages while suggesting improvements",
        system_prompt="""You are a Supportive Editor. Find what's working well and build on it.
When you suggest changes, frame them positively. Identify potential and help realize it.
Point out strong passages. Encourage the author while gently noting areas for improvement.""",
        tone=PersonaTone.SUPPORTIVE,
        focus_areas=["strengths", "potential", "encouragement"],
        color="#22c55e"  # Green
    ),
    Persona(
        id="technical-critic",
        name="Technical Critic",
        description="Focuses on structure, clarity, and precision",
        system_prompt="""You are a Technical Critic focused on structure and clarity.
Check for: logical flow, clear definitions, precise language, proper structure.
Flag jargon, ambiguity, or unclear transitions. Suggest specific rewrites.
Your comments should be actionable and precise.""",
        tone=PersonaTone.TECHNICAL,
        focus_areas=["structure", "clarity", "precision", "terminology"],
        color="#3b82f6"  # Blue
    ),
    Persona(
        id="casual-reader",
        name="Casual Reader",
        description="Represents a confused layperson perspective",
        system_prompt="""You are a Casual Reader with no expertise in this topic.
If something confuses you, say so. Ask "what does this mean?" and "why should I care?"
Point out where you got lost or bored. Your confusion is valuable feedback.
Be honest about what doesn't land for a general audience.""",
        tone=PersonaTone.NEUTRAL,
        focus_areas=["accessibility", "engagement", "confusion points"],
        color="#eab308"  # Yellow
    ),
]

class ReviewService:
    """AI-powered document review with streaming"""
    
    def __init__(self):
        self.settings = get_settings()
        self._personas = {p.id: p for p in DEFAULT_PERSONAS}
    
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
    
    async def review_document(
        self, 
        document_id: str,
        content: str, 
        version_hash: str,
        persona_ids: Optional[List[str]] = None,
        model: str = "claude-3-5-haiku-20241022"
    ) -> AsyncGenerator[Comment, None]:
        """Stream comments from multiple personas reviewing a document"""
        
        personas = [self._personas[pid] for pid in (persona_ids or self._personas.keys()) 
                   if pid in self._personas]
        
        paragraphs = self._parse_document_structure(content)
        
        async def review_with_persona(persona: Persona) -> AsyncGenerator[Comment, None]:
            client = AsyncAnthropic(api_key=self.settings.anthropic_api_key)
            
            prompt = f"""Review this document and provide specific, actionable comments.

Document:
---
{content}
---

For each comment, specify which paragraph (by number, 0-indexed) you're commenting on.
Format each comment as:
[PARAGRAPH X] Your comment here

Be specific and concise. Provide 3-5 comments total, focusing on different parts of the document."""

            async with client.messages.stream(
                model=model,
                max_tokens=1024,
                system=persona.system_prompt,
                messages=[{"role": "user", "content": prompt}]
            ) as stream:
                full_response = ""
                async for text in stream.text_stream:
                    full_response += text
                
                # Parse comments from response
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
                        yield comment
        
        # Run all personas concurrently and yield comments as they come
        async def gather_comments():
            tasks = []
            for persona in personas:
                async for comment in review_with_persona(persona):
                    yield comment
        
        async for comment in gather_comments():
            yield comment
