import time
import secrets
import hashlib
import hmac
from collections import defaultdict
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from core.config import get_settings

# CSRF token secret - generated once per process
_CSRF_SECRET = secrets.token_hex(32)

# State-changing HTTP methods that require CSRF protection
CSRF_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# Paths exempt from CSRF (e.g. file uploads that use multipart)
CSRF_EXEMPT_PATHS = {"/api/v1/reviews/upload"}


def generate_csrf_token(session_id: str) -> str:
    """Generate a CSRF token tied to a session identifier."""
    return hmac.new(
        _CSRF_SECRET.encode(),
        session_id.encode(),
        hashlib.sha256,
    ).hexdigest()


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple in-memory sliding window rate limiter per client IP."""

    def __init__(self, app):
        super().__init__(app)
        self._requests: dict[str, list[float]] = defaultdict(list)

    def _get_client_ip(self, request: Request) -> str:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    def _cleanup_old(self, ip: str, window: float):
        now = time.time()
        self._requests[ip] = [t for t in self._requests[ip] if now - t < window]

    async def dispatch(self, request: Request, call_next):
        settings = get_settings()
        if not settings.rate_limit_enabled:
            return await call_next(request)

        # Only rate-limit /api/ paths
        if not request.url.path.startswith("/api/"):
            return await call_next(request)

        ip = self._get_client_ip(request)
        window = 60.0  # 1 minute
        limit = settings.rate_limit_per_minute

        self._cleanup_old(ip, window)

        if len(self._requests[ip]) >= limit:
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Try again later."},
                headers={"Retry-After": "60"},
            )

        self._requests[ip].append(time.time())
        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(max(0, limit - len(self._requests[ip])))
        return response


class CSRFMiddleware(BaseHTTPMiddleware):
    """Basic CSRF protection for state-changing endpoints.

    Checks that state-changing requests (POST/PUT/PATCH/DELETE) include
    either a valid X-CSRF-Token header or an Origin/Referer header matching
    the expected host. This protects against cross-site form submissions.
    """

    async def dispatch(self, request: Request, call_next):
        settings = get_settings()
        if not settings.csrf_enabled:
            return await call_next(request)

        if request.method not in CSRF_METHODS:
            return await call_next(request)

        # Only enforce on /api/ paths
        if not request.url.path.startswith("/api/"):
            return await call_next(request)

        # Exempt specific paths
        for exempt in CSRF_EXEMPT_PATHS:
            if request.url.path.startswith(exempt):
                return await call_next(request)

        # Check 1: Accept requests with matching Origin or Referer
        origin = request.headers.get("origin")
        referer = request.headers.get("referer")
        host = request.headers.get("host", "")

        origin_valid = False
        if origin:
            # Extract host from origin (e.g., "http://localhost:3000" -> "localhost:3000")
            origin_host = origin.split("://", 1)[-1].rstrip("/")
            # Allow same-host or localhost development
            if origin_host == host or origin_host.startswith("localhost"):
                origin_valid = True
        elif referer:
            referer_host = referer.split("://", 1)[-1].split("/")[0]
            if referer_host == host or referer_host.startswith("localhost"):
                origin_valid = True

        # Check 2: Accept if X-CSRF-Token header is present (SPA pattern)
        # Any JavaScript-set custom header provides CSRF protection since
        # cross-origin requests with custom headers trigger CORS preflight
        csrf_token = request.headers.get("x-csrf-token")
        if csrf_token:
            origin_valid = True

        # Check 3: Accept Content-Type: application/json (AJAX pattern)
        # Browsers cannot send application/json cross-origin without CORS preflight
        content_type = request.headers.get("content-type", "")
        if "application/json" in content_type:
            origin_valid = True

        if not origin_valid:
            return JSONResponse(
                status_code=403,
                content={"detail": "CSRF validation failed"},
            )

        return await call_next(request)
