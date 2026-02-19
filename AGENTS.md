# VOS - Engineering Playbook

## For AI Contributors

This document helps AI coding agents understand the project quickly.

### Project Goal
Build a document review tool where AI personas provide opinionated feedback on markdown documents. Multiple personas review concurrently with differentiated perspectives. UI shows comments inline with persona colors. SQLite persists everything (PostgreSQL optional).

### Architecture
```
.run/               Run tooling (start/stop/restart/status/logs)
  vos               Main control script
  logs/             Backend + frontend logs

frontend/           Next.js 15 app (dark mode, Tailwind, bun)
  app/              App router pages
    page.tsx        Landing: drag-drop upload + paste markdown
    documents/      Document list + detail with review UI
  lib/              API client, config
  .env.local        NEXT_PUBLIC_API_URL (not committed)

backend/            FastAPI Python service (v0.3.0)
  api/              Route handlers (documents, personas, reviews, jobs, status)
  core/             Config, errors, observability, security (pure ASGI middlewares)
  database.py       SQLAlchemy + configurable DATABASE_URL (SQLite default, PG ready)
  services/         Review service (7 personas, concurrent AI calls)
  models/           Pydantic schemas
  alembic/          Database migrations
  tests/            pytest test suite (53 tests)
  .venv/            Python virtual environment
  .env              Secrets (not committed)
```

### Key Decisions
- **SQLite** default persistence — PostgreSQL via `DATABASE_URL` env var
- **7 AI Personas**: Devil's Advocate, Supportive Editor, Technical Architect, Casual Reader, Security Reviewer, Accessibility Advocate, Executive Summarizer
- **SSE streaming** for real-time review progress
- **Pure ASGI middlewares** — BaseHTTPMiddleware buffers StreamingResponse, breaking SSE
- **Concurrent persona execution** via asyncio.as_completed
- **Dark mode** throughout, custom Tailwind theme
- **Bun** for frontend package management (not npm)
- Git versioning removed in v0.2 (was over-engineered for demo)
- Auth deferred — placeholder for now

### API Endpoints
```
GET  /api/v1/documents/                    List documents
POST /api/v1/documents/                    Create document
GET  /api/v1/documents/{id}                Get document
GET  /api/v1/documents/{id}/content        Get raw content
GET  /api/v1/personas/                     List 7 personas
POST /api/v1/reviews/upload                Upload .md file
POST /api/v1/reviews/upload/raw            Upload raw markdown
POST /api/v1/reviews/{id}/review           Start SSE review stream
GET  /api/v1/reviews/{id}/reviews          List past reviews
GET  /api/v1/reviews/{id}/reviews/{rid}    Get review with comments
GET  /api/v1/reviews/{id}/reviews/latest/comments  Latest comments
POST /api/v1/reviews/{id}/reviews/{rid}/meta       Generate meta-review
GET  /api/v1/reviews/{id}/reviews/{rid}/meta       Get meta-review
GET  /api/v1/status/                       Health + versions
GET  /api/v1/metrics                       Request/review metrics
GET  /health                               Liveness probe
GET  /ready                                Readiness probe (checks DB)
```

### SSE Event Format
```json
{"type": "persona_status", "persona_id": "...", "status": "queued|running|completed"}
{"type": "comment", "comment": {...}}
{"type": "done", "total_comments": N}
{"type": "error", "error": "...", "detail": "..."}
```

### Running
```bash
# Preferred — run controller
.run/vos start              # start backend + frontend
.run/vos stop               # stop both
.run/vos restart backend    # restart just backend
.run/vos status             # health + PID + ports
.run/vos logs               # tail all logs
.run/vos logs backend       # tail backend only

# Manual
cd backend  && .venv/bin/uvicorn main:app --host 0.0.0.0 --port 8001 --reload
cd frontend && bun run dev --port 3011

# Docker
docker compose up
```

### Testing
```bash
cd backend && .venv/bin/python3 -m pytest tests/ -q
```

### Environment
```bash
# backend/.env (required)
ANTHROPIC_API_KEY=sk-ant-...

# backend/.env (optional)
DATABASE_URL=sqlite:///./vos.db          # or postgresql://...
DEBUG=false
RATE_LIMIT_ENABLED=true
RATE_LIMIT_PER_MINUTE=60
CSRF_ENABLED=true

# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8001
```

### Ports (defaults)
- Backend:  8001 (override: `VOS_BACKEND_PORT`)
- Frontend: 3011 (override: `VOS_FRONTEND_PORT`)

### Current Phase
M2: Demo-ready — full review pipeline, 7 personas, persistence, observability, polished dark UI
