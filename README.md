# VOS

[![CI](https://github.com/Bluesun-Networks/VOS/actions/workflows/ci.yml/badge.svg)](https://github.com/Bluesun-Networks/VOS/actions/workflows/ci.yml)

### Voxora · Opinari · Scrutara
*Many voices. Many opinions. One scrutiny.*

AI-powered document review with configurable personas. Git-backed versioning, real-time streaming, boardroom-grade UI.

## What is this?

VOS lets you review documents (markdown) through multiple AI "personas" - each with their own perspective, focus areas, and tone. Think: security reviewer, legal counsel, technical architect, devil's advocate - all examining your doc simultaneously.

Built for reviewing AI-generated content, policy documents, technical specs, or anything that benefits from multiple critical perspectives.

## Tech Stack

- **Frontend:** Next.js 14+ / React / shadcn/ui / Tailwind
- **Backend:** FastAPI (Python 3.11+)
- **Versioning:** Git (native - every doc is a repo)
- **Database:** PostgreSQL (metadata) + Redis (cache/pubsub)
- **AI:** Claude (Anthropic) with pluggable provider abstraction

## Status

🚧 Under construction

## License

MIT
