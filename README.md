# Nova Island

A full-stack community platform combining a public marketing site with a member-only
community: discussion posts, columns, voyages, events, rankings, notifications, and a
moderation/admin console.

The repository is a monorepo containing a Next.js frontend and a FastAPI backend, with
Docker Compose orchestration for local development and single-server production
deployment.

## Table of contents

- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Quick start with Docker Compose](#quick-start-with-docker-compose)
- [Local development](#local-development)
- [Configuration](#configuration)
- [API surface](#api-surface)
- [Application routes](#application-routes)
- [Testing and quality gates](#testing-and-quality-gates)
- [Deployment](#deployment)
- [Security model](#security-model)

## Architecture

The browser never talks to the API directly. All requests go to the same origin under
`/api/v1` and are forwarded by a Next.js rewrite to `API_INTERNAL_BASE_URL`. This keeps
the `HttpOnly` refresh cookie scoped to the frontend origin and allows server-side
rendering to resolve the current user.

```text
Browser
  │  same-origin /api/v1  and  /media
  ▼
Next.js (front, :3000) ──rewrite──▶ FastAPI (backend, :8000)
                                        ├── MySQL 8.4      persistent data
                                        ├── Redis 7        rate limiting, refresh
                                        │                  sessions, hot cache
                                        └── local volume   uploaded media
```

In production a Caddy reverse proxy terminates TLS on ports 80/443 in front of the
Next.js service and obtains certificates automatically.

> Do not point `NEXT_PUBLIC_API_BASE_URL` at a cross-origin API address. Doing so breaks
> the `HttpOnly` session cookie ownership and server-rendered identity.

## Tech stack

### Frontend (`front/`)

| Component | Version / choice |
| --- | --- |
| Framework | Next.js 16 (App Router, standalone output) |
| UI runtime | React 19 |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 4 (via `@tailwindcss/postcss`) |
| Validation | Zod 4 |
| Testing | Vitest 4 |
| Linting | ESLint 9 with `eslint-config-next` |
| Node.js | 24 (see `front/.nvmrc`) |

### Backend (`backend/`)

| Component | Version / choice |
| --- | --- |
| Framework | FastAPI 0.115+ on Uvicorn |
| Language | Python 3.10 or newer |
| Package manager | [uv](https://docs.astral.sh/uv/) (`uv.lock` committed) |
| ORM | SQLAlchemy 2 (async) with `aiomysql` |
| Migrations | Alembic |
| Database | MySQL 8.4 |
| Cache / limiter | Redis 7 |
| Auth | PyJWT (HS256) |
| Images | Pillow |
| Testing | pytest (in-memory SQLite, no external services required) |
| Linting | Ruff |

## Repository layout

```text
front/                    Next.js application (App Router)
  src/app/                  routes and pages
  public/                   static assets and media
backend/
  app/
    api/v1/routers/         HTTP endpoints grouped by domain
    models/                 SQLAlchemy models (auth, community, notification)
    services/               business logic (auth, community, ranking, uploads, ...)
    middleware/             request context and auth rate limiting
    core/                   settings, storage backends
  alembic/                  database migrations
  tests/                    pytest suite
deploy/                   Caddy config and offline release scripts
docker-compose.yml        mysql + redis + backend + front
docker-compose.prod.yml   production overlay adding Caddy (TLS)
```

## Quick start with Docker Compose

Requires Docker with the Compose plugin.

```bash
cp compose.env.example .env
docker compose up -d --build
```

| Service | URL |
| --- | --- |
| Application | http://localhost:3000 |
| API (direct, optional) | http://localhost:8000 |
| API docs (development only) | http://localhost:8000/docs |

`/api/v1` and `/media` are proxied through the frontend origin. Stop the stack with
`docker compose down`; adding `-v` also deletes the data volumes.

Named volumes: `mysql_data`, `redis_data`, `backend_uploads`.

### Demo accounts

With an empty database and `DB_SEED=true` (the Compose default), two accounts are
seeded: `leo` (moderator) and `yhy` (admin). Both use the value of
`SEED_DEFAULT_PASSWORD` (`island@2026` by default).

`APP_ENV=production` rejects this default password, rejects `DB_SEED=true`, and rejects
placeholder JWT secrets — the process fails to start rather than running insecurely.

### Activating imported accounts

Accounts created by a bulk community import have no password hash. Logging in returns
error code `401004`. An administrator activates such an account from
`/admin/users` → **reset password**, which issues a temporary password; the user is then
forced to set a new one (minimum 8 characters, letters and digits). Administrators
cannot reset their own password (`400010`) and must use account settings instead.

To promote the first administrator on an empty database, see
[`deploy/README.md`](deploy/README.md), section 4.

## Local development

Run the backend and frontend separately against a local MySQL and Redis.

### Backend

```bash
cd backend
cp .env.example .env          # adjust MySQL / Redis connection details
uv sync
uv run alembic upgrade head
uv run python run.py --reload
```

### Frontend

```bash
cd front
cp .env.example .env.local
npm install
npm run dev
```

## Configuration

Environment variables are documented inline in the example files. Copy the one that
matches your target and never commit the resulting file — `.env` and `.env.*` are
ignored by git.

| Example file | Purpose |
| --- | --- |
| `compose.env.example` | Docker Compose, local development defaults |
| `compose.env.production.example` | Docker Compose, production; all placeholders must be replaced |
| `backend/.env.example` | Backend running outside Docker (full reference) |
| `front/.env.example` | Frontend running outside Docker |

Notable settings:

| Variable | Notes |
| --- | --- |
| `APP_ENV` | `development` or `production`; production enforces secret strength and disables `/docs` |
| `SITE_DOMAIN` | Domain(s) Caddy serves and requests certificates for; comma-separated |
| `JWT_SECRET` | Generate with `openssl rand -hex 32` |
| `DB_SEED` | Must be `false` in production |
| `STORAGE_BACKEND` | `local` (default) or `s3` for S3/MinIO-compatible storage |
| `RATE_LIMIT_ENABLED` | Redis-backed rate limiting on auth endpoints |
| `RANKING_RECALC_*` | Daily ranking recomputation schedule (default 03:00 `Asia/Shanghai`) |

## API surface

All endpoints are served under `/api/v1`. Interactive documentation is available at
`/docs` when `APP_ENV=development`.

| Prefix | Responsibility |
| --- | --- |
| `/health` | Liveness and readiness probes |
| `/auth` | Registration, login, logout, token refresh, password change |
| `/users` | Profiles, follow and unfollow, follower lists |
| `/posts` | Posts, comments, likes, bookmarks, drafts, moderation actions |
| `/tags` | Tag listing and management |
| `/columns` | Serialized column content |
| `/voyages` | Voyage programs |
| `/events` | Community events |
| `/rankings` | Contribution leaderboards |
| `/notifications` | User notification feed |
| `/uploads` | Attachment and image upload |
| `/admin` | User, content, tag, and operations administration |

Uploaded media is served from `/media`, backed either by a local volume or by
S3-compatible object storage.

## Application routes

| Area | Routes |
| --- | --- |
| Marketing | `/`, `/privacy`, `/terms` |
| Account | `/login`, `/register`, `/settings`, `/force-change-password` |
| Community | `/community`, `/community/latest`, `/community/following`, `/community/search` |
| Content types | `/community/columns`, `/community/voyages`, `/community/events`, `/community/ranking` |
| Posts | `/community/new`, `/community/[id]`, `/community/[id]/edit` |
| Personal | `/bookmarks`, `/drafts`, `/notifications` |
| Profiles | `/u/[username]`, `/u/[username]/followers`, `/u/[username]/following` |
| Administration | `/admin`, `/admin/users`, `/admin/content`, `/admin/tags`, `/admin/operations` |

## Testing and quality gates

```bash
# Backend: lint and tests (SQLite in memory, Redis disabled — no services needed)
cd backend && uv run ruff check . && uv run pytest

# Frontend: lint, type check, unit tests, production build
cd front && npm run check
```

Both suites run in GitHub Actions on pull requests and on pushes to `main`:
`.github/workflows/backend-ci.yml` and `.github/workflows/frontend-ci.yml`.

## Deployment

Single-server deployment uses the production overlay, which adds Caddy for TLS
termination and automatic certificate management:

```bash
cp compose.env.production.example .env
# replace every <...> placeholder, in particular SITE_DOMAIN, MYSQL_PASSWORD, JWT_SECRET
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Only ports 22, 80, and 443 need to be reachable from the internet; 3000 and 8000 should
stay private.

For first-time setup including DNS and administrator bootstrap, see
[`deploy/README.md`](deploy/README.md). For upgrading a running instance with
prebuilt `linux/amd64` images — useful when the server has slow or restricted network
access — see [`deploy/UPGRADE.md`](deploy/UPGRADE.md). The backend container runs
`alembic upgrade head` on startup, so schema migrations apply automatically.

## Security model

- **Tokens.** Short-lived JWT access tokens plus a refresh token delivered only as an
  `HttpOnly` cookie scoped to `/api/v1/auth`. Refresh sessions and revocations are
  tracked in Redis.
- **Same-origin proxying.** The browser only ever calls the frontend origin, so session
  cookies are never exposed cross-site.
- **Rate limiting.** Auth endpoints are rate limited per window through Redis.
- **Production guards.** Starting with `APP_ENV=production` while a default secret,
  demo seed password, or `DB_SEED=true` is present aborts startup.
- **Role-based access control.** Member, moderator, and admin roles gate moderation and
  administration endpoints.
- **Secrets.** Only example files are committed. Real values belong in `.env` on the
  target machine, which git ignores.
