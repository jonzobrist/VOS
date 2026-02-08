from fastapi import APIRouter, HTTPException

from services.review_service import ReviewService

router = APIRouter()
review_service = ReviewService()


@router.get("/")
async def list_personas():
    """List all available personas"""
    return [p.model_dump() for p in review_service.list_personas()]


@router.get("/{persona_id}")
async def get_persona(persona_id: str):
    """Get a persona by ID"""
    persona = review_service.get_persona(persona_id)
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    return persona.model_dump()
