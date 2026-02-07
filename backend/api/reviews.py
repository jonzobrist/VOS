import re
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.responses import StreamingResponse
from typing import List, Optional
from pydantic import BaseModel
import json

from models.document import DocumentCreate
from services.document_service import DocumentService
from services.review_service import ReviewService

router = APIRouter()
doc_service = DocumentService()
review_service = ReviewService()

class ReviewRequest(BaseModel):
    persona_ids: Optional[List[str]] = None
    model: Optional[str] = "claude-3-5-haiku-20241022"

class UploadResponse(BaseModel):
    document_id: str
    title: str
    message: str

def extract_title_from_markdown(content: str, filename: str) -> str:
    """Extract title from first heading or fallback to filename"""
    # Try to find first # heading
    match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
    if match:
        return match.group(1).strip()
    
    # Fallback to filename without extension
    if filename.endswith('.md'):
        return filename[:-3].replace('-', ' ').replace('_', ' ').title()
    return filename

@router.post("/upload", response_model=UploadResponse)
async def upload_document(file: UploadFile = File(...)):
    """Upload a markdown file and create a document"""
    if not file.filename.endswith('.md'):
        raise HTTPException(status_code=400, detail="Only .md files are supported")
    
    content = await file.read()
    content_str = content.decode('utf-8')
    
    title = extract_title_from_markdown(content_str, file.filename)
    
    doc = doc_service.create(DocumentCreate(
        title=title,
        content=content_str,
        description=f"Uploaded from {file.filename}"
    ))
    
    return UploadResponse(
        document_id=doc.id,
        title=doc.title,
        message="Document uploaded successfully"
    )

@router.post("/upload/raw", response_model=UploadResponse)
async def upload_raw(content: str, filename: Optional[str] = "untitled.md"):
    """Upload raw markdown content"""
    title = extract_title_from_markdown(content, filename)
    
    doc = doc_service.create(DocumentCreate(
        title=title,
        content=content,
        description="Uploaded via raw content"
    ))
    
    return UploadResponse(
        document_id=doc.id,
        title=doc.title,
        message="Document created successfully"
    )

@router.get("/personas")
async def list_personas():
    """List all available personas"""
    return {"personas": review_service.list_personas()}

@router.post("/{doc_id}/review")
async def start_review(doc_id: str, request: ReviewRequest):
    """Start a review and stream comments via SSE"""
    doc = doc_service.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    content = doc_service.get_content(doc_id)
    version_hash = doc.versions[0].commit_hash if doc.versions else "HEAD"
    
    async def generate():
        async for comment in review_service.review_document(
            document_id=doc_id,
            content=content,
            version_hash=version_hash,
            persona_ids=request.persona_ids,
            model=request.model
        ):
            yield f"data: {comment.model_dump_json()}\n\n"
        yield "data: {\"done\": true}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )

@router.websocket("/{doc_id}/review/ws")
async def review_websocket(websocket: WebSocket, doc_id: str):
    """WebSocket endpoint for streaming review comments"""
    await websocket.accept()
    
    try:
        # Get initial config from client
        data = await websocket.receive_json()
        persona_ids = data.get("persona_ids")
        model = data.get("model", "claude-3-5-haiku-20241022")
        
        doc = doc_service.get(doc_id)
        if not doc:
            await websocket.send_json({"error": "Document not found"})
            await websocket.close()
            return
        
        content = doc_service.get_content(doc_id)
        version_hash = doc.versions[0].commit_hash if doc.versions else "HEAD"
        
        await websocket.send_json({"status": "started", "personas": len(persona_ids or review_service.list_personas())})
        
        async for comment in review_service.review_document(
            document_id=doc_id,
            content=content,
            version_hash=version_hash,
            persona_ids=persona_ids,
            model=model
        ):
            await websocket.send_json({
                "type": "comment",
                "comment": comment.model_dump()
            })
        
        await websocket.send_json({"type": "done"})
        
    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.send_json({"error": str(e)})
    finally:
        await websocket.close()
