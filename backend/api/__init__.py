from fastapi import APIRouter
from .documents import router as documents_router
from .personas import router as personas_router
from .reviews import router as reviews_router
from .jobs import router as jobs_router
from .status import router as status_router

api_router = APIRouter()
api_router.include_router(documents_router, prefix="/documents", tags=["documents"])
api_router.include_router(personas_router, prefix="/personas", tags=["personas"])
api_router.include_router(reviews_router, prefix="/reviews", tags=["reviews"])
api_router.include_router(jobs_router, prefix="/jobs", tags=["jobs"])
api_router.include_router(status_router, prefix="/status", tags=["status"])
