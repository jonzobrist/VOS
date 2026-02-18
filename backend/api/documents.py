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
    is_archived: bool = False
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

    return _doc_out(db_doc)


def _doc_out(d: DbDocument) -> DocumentOut:
    return DocumentOut(
        id=d.id,
        title=d.title,
        description=d.description,
        content=d.content,
        is_archived=bool(d.is_archived),
        created_at=d.created_at.isoformat(),
        updated_at=d.updated_at.isoformat(),
        review_count=len(d.reviews),
    )


@router.get("/", response_model=List[DocumentOut])
async def list_documents(include_archived: bool = False, db: Session = Depends(get_db)):
    query = db.query(DbDocument)
    if not include_archived:
        query = query.filter(DbDocument.is_archived == False)
    docs = query.order_by(DbDocument.created_at.desc()).all()
    return [_doc_out(d) for d in docs]


@router.get("/{doc_id}", response_model=DocumentOut)
async def get_document(doc_id: str, db: Session = Depends(get_db)):
    d = db.query(DbDocument).filter(DbDocument.id == doc_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Document not found")
    return _doc_out(d)


@router.get("/{doc_id}/content")
async def get_document_content(doc_id: str, db: Session = Depends(get_db)):
    d = db.query(DbDocument).filter(DbDocument.id == doc_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"content": d.content}


@router.post("/{doc_id}/archive")
async def archive_document(doc_id: str, db: Session = Depends(get_db)):
    d = db.query(DbDocument).filter(DbDocument.id == doc_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Document not found")
    d.is_archived = True
    db.commit()
    return _doc_out(d)


@router.post("/{doc_id}/restore")
async def restore_document(doc_id: str, db: Session = Depends(get_db)):
    d = db.query(DbDocument).filter(DbDocument.id == doc_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Document not found")
    d.is_archived = False
    db.commit()
    return _doc_out(d)


@router.delete("/{doc_id}")
async def delete_document(doc_id: str, db: Session = Depends(get_db)):
    d = db.query(DbDocument).filter(DbDocument.id == doc_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Document not found")
    db.delete(d)
    db.commit()
    return {"message": "Document deleted"}
