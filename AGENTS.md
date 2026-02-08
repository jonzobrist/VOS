# VOS - Engineering Playbook

## For AI Contributors

This document helps AI coding agents understand the project quickly.

### Project Goal
Build a document review tool where AI personas provide opinionated feedback on markdown documents. Multiple personas review concurrently with differentiated perspectives. UI shows comments inline with persona colors. SQLite persists everything.

### Architecture
```
frontend/          Next.js 14+ app (dark mode, Tailwind)
  app/             App router pages
    page.tsx       Landing: drag-drop upload + paste markdown
    documents/     Document list + detail with review UI
  lib/             API client, config
  components/      (legacy, unused)

backend/           FastAPI Python service
  api/             Route handlers (documents, personas, reviews)
  core/            Config
  database.py      SQLAlchemy models + SQLite
  services/        Review service (7 personas, concurrent AI calls)
  models/          Pydantic schemas
```

### Key Decisions
- **SQLite** for persistence (documents, reviews, comments) — no external DB needed
- **7 AI Personas**: Devil's Advocate, Supportive Editor, Technical Architect, Casual Reader, Security Reviewer, Accessibility Advocate, Executive Summarizer
- **SSE streaming** for real-time review progress
- **Concurrent persona execution** via asyncio.as_completed
- **Dark mode** throughout, custom Tailwind theme
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
```

### SSE Event Format
```json
{"type": "persona_status", "persona_id": "...", "status": "queued|running|completed"}
{"type": "comment", "comment": {...}}
{"type": "done", "total_comments": N}
```

### Commands
```bash
# Frontend
cd frontend && bun run dev

# Backend
cd backend && uvicorn main:app --reload

# Both (docker)
docker compose up
```

### Current Phase
M2: Demo-ready — full review pipeline, 7 personas, persistence, polished dark UI
