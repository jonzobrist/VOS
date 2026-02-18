import os
import shutil
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import List
from sqlalchemy.orm import Session
from sqlalchemy import text

from database import get_db, DATABASE_URL
from core.config import get_settings

router = APIRouter()


class CheckDetail(BaseModel):
    name: str
    status: str  # healthy, degraded, unhealthy
    message: str


class HealthResponse(BaseModel):
    status: str  # healthy, degraded, unhealthy
    checks: List[CheckDetail]


@router.get("/", response_model=HealthResponse)
async def system_status(db: Session = Depends(get_db)):
    """Check system health with dependency checks"""
    checks = []

    # 1. Database connectivity
    try:
        db.execute(text("SELECT 1"))
        checks.append(CheckDetail(name="database", status="healthy", message="SQLite connection OK"))
    except Exception as e:
        checks.append(CheckDetail(name="database", status="unhealthy", message=f"Database error: {e}"))

    # 2. Anthropic API key check (presence only, no API call)
    settings = get_settings()
    if settings.anthropic_api_key:
        checks.append(CheckDetail(
            name="anthropic_api_key",
            status="healthy",
            message="API key is configured",
        ))
    else:
        checks.append(CheckDetail(
            name="anthropic_api_key",
            status="unhealthy",
            message="ANTHROPIC_API_KEY is not set",
        ))

    # 3. Disk space for SQLite DB
    db_path = DATABASE_URL.replace("sqlite:///", "")
    db_dir = os.path.dirname(os.path.abspath(db_path)) if db_path else "."
    try:
        disk = shutil.disk_usage(db_dir)
        free_mb = disk.free / (1024 * 1024)
        if free_mb > 100:
            checks.append(CheckDetail(
                name="disk_space",
                status="healthy",
                message=f"{free_mb:.0f} MB free",
            ))
        elif free_mb > 10:
            checks.append(CheckDetail(
                name="disk_space",
                status="degraded",
                message=f"Low disk space: {free_mb:.0f} MB free",
            ))
        else:
            checks.append(CheckDetail(
                name="disk_space",
                status="unhealthy",
                message=f"Critical disk space: {free_mb:.0f} MB free",
            ))
    except Exception as e:
        checks.append(CheckDetail(name="disk_space", status="unhealthy", message=f"Disk check failed: {e}"))

    # Overall status: worst of all checks
    statuses = [c.status for c in checks]
    if "unhealthy" in statuses:
        overall = "unhealthy"
    elif "degraded" in statuses:
        overall = "degraded"
    else:
        overall = "healthy"

    return HealthResponse(status=overall, checks=checks)
