import re
import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from fastapi.responses import StreamingResponse
from typing import List, Optional
from pydantic import BaseModel
from sqlalchemy.orm import Session
import json

from database import get_db, DbDocument, DbReview, DbComment
from services.review_service import ReviewService

router = APIRouter()
review_service = ReviewService()


class ReviewRequest(BaseModel):
    persona_ids: Optional[List[str]] = None
    model: Optional[str] = "claude-sonnet-4-5-20250929"


class RawUploadRequest(BaseModel):
    content: str
    title: Optional[str] = None


class UploadResponse(BaseModel):
    document_id: str
    title: str
    message: str


class ReviewSummary(BaseModel):
    id: str
    document_id: str
    persona_ids: List[str]
    status: str
    created_at: str
    completed_at: Optional[str] = None
    comment_count: int = 0


class CommentOut(BaseModel):
    id: str
    persona_id: str
    persona_name: str
    persona_color: str
    content: str
    start_line: int
    end_line: int
    created_at: str


class ReviewDetail(ReviewSummary):
    comments: List[CommentOut] = []


def extract_title_from_markdown(content: str, filename: str) -> str:
    match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
    if match:
        return match.group(1).strip()
    if filename.endswith('.md'):
        return filename[:-3].replace('-', ' ').replace('_', ' ').title()
    return filename


@router.post("/upload", response_model=UploadResponse)
async def upload_document(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename or not file.filename.endswith('.md'):
        raise HTTPException(status_code=400, detail="Only .md files are supported")

    content = await file.read()
    content_str = content.decode('utf-8')
    title = extract_title_from_markdown(content_str, file.filename)

    doc_id = str(uuid.uuid4())[:8]
    db_doc = DbDocument(
        id=doc_id,
        title=title,
        description=f"Uploaded from {file.filename}",
        content=content_str,
    )
    db.add(db_doc)
    db.commit()

    return UploadResponse(document_id=doc_id, title=title, message="Document uploaded successfully")


@router.post("/upload/raw", response_model=UploadResponse)
async def upload_raw(req: RawUploadRequest, db: Session = Depends(get_db)):
    title = req.title or extract_title_from_markdown(req.content, "untitled.md")

    doc_id = str(uuid.uuid4())[:8]
    db_doc = DbDocument(
        id=doc_id,
        title=title,
        description="Uploaded via paste",
        content=req.content,
    )
    db.add(db_doc)
    db.commit()

    return UploadResponse(document_id=doc_id, title=title, message="Document created successfully")


@router.get("/personas")
async def list_personas():
    return {"personas": [p.model_dump() for p in review_service.list_personas()]}


@router.post("/{doc_id}/review")
async def start_review(doc_id: str, request: ReviewRequest, db: Session = Depends(get_db)):
    db_doc = db.query(DbDocument).filter(DbDocument.id == doc_id).first()
    if not db_doc:
        raise HTTPException(status_code=404, detail="Document not found")

    persona_ids = request.persona_ids or [p.id for p in review_service.list_personas()]
    valid_ids = [pid for pid in persona_ids if review_service.get_persona(pid)]

    review_id = str(uuid.uuid4())[:8]
    db_review = DbReview(
        id=review_id,
        document_id=doc_id,
        persona_ids=valid_ids,
        status="running",
    )
    db.add(db_review)
    db.commit()

    doc_content = db_doc.content

    async def generate():
        all_comments = []
        async for event in review_service.review_document(
            document_id=doc_id,
            content=doc_content,
            version_hash="HEAD",
            persona_ids=valid_ids,
            model=request.model or "claude-sonnet-4-5-20250929",
        ):
            yield f"data: {json.dumps(event, default=str)}\n\n"

            if event.get("type") == "comment":
                all_comments.append(event["comment"])

            if event.get("type") == "done":
                persist_db = next(get_db())
                try:
                    for c in all_comments:
                        db_comment = DbComment(
                            id=c["id"],
                            review_id=review_id,
                            document_id=doc_id,
                            persona_id=c["persona_id"],
                            persona_name=c["persona_name"],
                            persona_color=c["persona_color"],
                            content=c["content"],
                            start_line=c["anchor"]["start_line"],
                            end_line=c["anchor"]["end_line"],
                        )
                        persist_db.add(db_comment)

                    review = persist_db.query(DbReview).filter(DbReview.id == review_id).first()
                    if review:
                        review.status = "completed"
                        review.completed_at = datetime.utcnow()

                    persist_db.commit()
                finally:
                    persist_db.close()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.get("/{doc_id}/reviews", response_model=List[ReviewSummary])
async def list_reviews(doc_id: str, db: Session = Depends(get_db)):
    reviews = db.query(DbReview).filter(DbReview.document_id == doc_id).order_by(DbReview.created_at.desc()).all()
    return [
        ReviewSummary(
            id=r.id,
            document_id=r.document_id,
            persona_ids=r.persona_ids,
            status=r.status,
            created_at=r.created_at.isoformat(),
            completed_at=r.completed_at.isoformat() if r.completed_at else None,
            comment_count=len(r.comments),
        )
        for r in reviews
    ]


@router.get("/{doc_id}/reviews/{review_id}", response_model=ReviewDetail)
async def get_review(doc_id: str, review_id: str, db: Session = Depends(get_db)):
    review = db.query(DbReview).filter(
        DbReview.id == review_id, DbReview.document_id == doc_id
    ).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    return ReviewDetail(
        id=review.id,
        document_id=review.document_id,
        persona_ids=review.persona_ids,
        status=review.status,
        created_at=review.created_at.isoformat(),
        completed_at=review.completed_at.isoformat() if review.completed_at else None,
        comment_count=len(review.comments),
        comments=[
            CommentOut(
                id=c.id,
                persona_id=c.persona_id,
                persona_name=c.persona_name,
                persona_color=c.persona_color,
                content=c.content,
                start_line=c.start_line,
                end_line=c.end_line,
                created_at=c.created_at.isoformat(),
            )
            for c in review.comments
        ],
    )


@router.get("/{doc_id}/reviews/latest/comments", response_model=List[CommentOut])
async def get_latest_comments(doc_id: str, db: Session = Depends(get_db)):
    review = db.query(DbReview).filter(
        DbReview.document_id == doc_id, DbReview.status == "completed"
    ).order_by(DbReview.created_at.desc()).first()

    if not review:
        return []

    return [
        CommentOut(
            id=c.id,
            persona_id=c.persona_id,
            persona_name=c.persona_name,
            persona_color=c.persona_color,
            content=c.content,
            start_line=c.start_line,
            end_line=c.end_line,
            created_at=c.created_at.isoformat(),
        )
        for c in review.comments
    ]
