# VOS - Engineering Playbook

## For AI Contributors

This document helps AI coding agents understand the project quickly.

### Project Goal
Build a document review tool where AI personas provide opinionated feedback on markdown documents. Git handles versioning. UI shows comments inline with persona colors/themes.

### Architecture
```
frontend/          Next.js 14+ app
  app/             App router pages
  components/      React components
  lib/             Utilities

backend/           FastAPI Python service
  api/             Route handlers
  core/            Business logic
  models/          Pydantic models
  services/        AI provider, git ops

docs/              Documentation
```

### Key Decisions
- Git for document versioning (branches, commits, diffs)
- Markdown only (no PDF/Word parsing)
- Real-time streaming for AI responses (SSE)
- Claude first, but provider abstraction for others
- Auth deferred - placeholder Admin for now

### Coding Standards
- TypeScript strict mode (frontend)
- Python type hints required (backend)
- Tests for all new features
- Small, focused PRs
- Update this file when architecture changes

### Current Phase
M1: Foundation - scaffold, git ops, basic UI shell

### Commands
```bash
# Frontend
cd frontend && npm run dev

# Backend  
cd backend && uvicorn main:app --reload

# Both (docker)
docker compose up
```
