# VOS

[![CI](https://github.com/Bluesun-Networks/VOS/actions/workflows/ci.yml/badge.svg)](https://github.com/Bluesun-Networks/VOS/actions/workflows/ci.yml)

### Voxora · Opinari · Scrutara
*Many voices. Many opinions. One scrutiny.*

AI-powered document review with configurable personas. Real-time streaming, boardroom-grade UI.

## What is this?

VOS lets you review documents (markdown) through multiple AI "personas" — each with their own perspective, focus areas, and tone. Think: security reviewer, technical architect, devil's advocate, executive summarizer — all examining your doc simultaneously via SSE streaming.

## Quick Start

```bash
# 1. Configure
cp backend/.env.example backend/.env
# edit backend/.env → set ANTHROPIC_API_KEY

# 2. Run
.run/vos start

# 3. Open
open http://localhost:3011
```

## Run Controller

```bash
.run/vos start              # start backend + frontend
.run/vos stop               # stop both
.run/vos restart             # restart both
.run/vos restart backend     # restart just backend
.run/vos status              # show health, PIDs, ports
.run/vos logs                # tail all logs
.run/vos logs backend        # tail backend only
```

Logs are in `.run/logs/`. Override ports with `VOS_BACKEND_PORT` and `VOS_FRONTEND_PORT`.

## Tech Stack

- **Frontend:** Next.js 15 / React / shadcn/ui / Tailwind / Bun
- **Backend:** FastAPI / Python 3.11+ / SQLAlchemy
- **Database:** SQLite (default) or PostgreSQL via `DATABASE_URL`
- **AI:** Claude (Anthropic)

## Testing

```bash
cd backend && .venv/bin/python3 -m pytest tests/ -q
```

## License

MIT
