import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db, DbDocument

router = APIRouter()


class DocumentOut(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    content: str
    created_at: str
    updated_at: str
    review_count: int = 0


class DocumentCreate(BaseModel):
    title: str
    content: str
    description: Optional[str] = None


@router.post("/", response_model=DocumentOut)
async def create_document(doc: DocumentCreate, db: Session = Depends(get_db)):
    doc_id = str(uuid.uuid4())[:8]
    now = datetime.utcnow()
    db_doc = DbDocument(
        id=doc_id,
        title=doc.title,
        description=doc.description,
        content=doc.content,
        created_at=now,
        updated_at=now,
    )
    db.add(db_doc)
    db.commit()
    db.refresh(db_doc)

    return DocumentOut(
        id=db_doc.id,
        title=db_doc.title,
        description=db_doc.description,
        content=db_doc.content,
        created_at=db_doc.created_at.isoformat(),
        updated_at=db_doc.updated_at.isoformat(),
        review_count=len(db_doc.reviews),
    )


@router.get("/", response_model=List[DocumentOut])
async def list_documents(db: Session = Depends(get_db)):
    docs = db.query(DbDocument).order_by(DbDocument.created_at.desc()).all()
    return [
        DocumentOut(
            id=d.id,
            title=d.title,
            description=d.description,
            content=d.content,
            created_at=d.created_at.isoformat(),
            updated_at=d.updated_at.isoformat(),
            review_count=len(d.reviews),
        )
        for d in docs
    ]


@router.get("/{doc_id}", response_model=DocumentOut)
async def get_document(doc_id: str, db: Session = Depends(get_db)):
    d = db.query(DbDocument).filter(DbDocument.id == doc_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Document not found")
    return DocumentOut(
        id=d.id,
        title=d.title,
        description=d.description,
        content=d.content,
        created_at=d.created_at.isoformat(),
        updated_at=d.updated_at.isoformat(),
        review_count=len(d.reviews),
    )


@router.get("/{doc_id}/content")
async def get_document_content(doc_id: str, db: Session = Depends(get_db)):
    d = db.query(DbDocument).filter(DbDocument.id == doc_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"content": d.content}


@router.delete("/{doc_id}")
async def delete_document(doc_id: str, db: Session = Depends(get_db)):
    d = db.query(DbDocument).filter(DbDocument.id == doc_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Document not found")
    db.delete(d)
    db.commit()
    return {"message": "Document deleted"}
