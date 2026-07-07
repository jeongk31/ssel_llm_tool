# Deployment & Data Storage

ChAT (Chat Annotation Toolkit) stores its usage analytics in **PostgreSQL**, selected
entirely by the **`DATABASE_URL`** environment variable. Postgres is **required** — there
is no SQLite fallback, so a missing or misconfigured `DATABASE_URL` is a loud startup
error rather than a silent switch to throwaway storage.

| Environment | `DATABASE_URL` | Persistence |
|---|---|---|
| Local dev | a Postgres URL you provide | Survives restarts |
| Railway | `${{Postgres.DATABASE_URL}}` (managed Postgres) | Survives every deploy |
| University server | Postgres URL you provide | Survives redeploys |

The app auto-upgrades `postgres://` / `postgresql://` URLs to the async `postgresql+asyncpg://`
driver, so you can paste a managed-Postgres URL verbatim. If `DATABASE_URL` is unset,
unresolved (e.g. `${{Postgres.DATABASE_URL}}` with no Postgres service), or not a Postgres
URL, the backend raises a clear error on startup.

## The database has a single table

Only **`usage_events`** is used (visits + runs). It's created automatically on startup via
`Base.metadata.create_all`; a lightweight migration adds any newly-introduced columns. You
never run SQL by hand. (Legacy `projects` / `pipeline_runs` tables, if present from an older
version, are dropped automatically on startup.)

> Tables only appear **after the backend boots while connected to the target database.**
> An empty database usually means it hasn't been redeployed yet, `DATABASE_URL` isn't
> resolving, or startup crashed — check the deploy logs.

---

## Local development

You need a Postgres to point at. Either run one locally (or via Docker) or reuse a
managed one, then set `DATABASE_URL` before starting the backend:

```bash
# example: local Postgres
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/chat
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

Quick Postgres via Docker:
```bash
docker run --name chat-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=chat -p 5432:5432 -d postgres:16
```

---

## Railway (current hosting)

Railway containers use **ephemeral disk** — a bare SQLite file is wiped on every deploy.
Use Railway's managed Postgres, which runs as its own service and persists independently.

1. Project → **New → Database → Add PostgreSQL**. Confirm the service is named **`Postgres`**.
2. Backend service → **Variables** → add:
   ```
   DATABASE_URL = ${{Postgres.DATABASE_URL}}
   ```
   (If the DB service has a different name, match it: `${{<name>.DATABASE_URL}}`.)
3. **Redeploy** the backend (make sure the deployed commit includes `asyncpg` support).

Verify: the backend's `DATABASE_URL` now shows a real `postgresql://…railway.internal:5432/railway`
value; the deploy logs show `ChAT (Chat Annotation Toolkit) API started — database: postgresql`
with no traceback; and the Postgres service's **Data** tab lists the `usage_events` table.

---

## University server (future)

Same code — just point `DATABASE_URL` at a Postgres available there.

1. Provision Postgres (managed instance, or `apt install postgresql` + create a database/user).
2. Set the backend's environment:
   ```
   DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME
   ```
3. Install deps and start the backend (`pip install -r backend/requirements.txt`, then
   run uvicorn behind your process manager / reverse proxy).

Tables are created automatically on first startup.

### Carrying data over from Railway

```bash
pg_dump "<railway DATABASE_URL>"       > analytics.sql
psql    "<university DATABASE_URL>"     < analytics.sql
```

---

## Admin analytics

- Dashboard: **`/admin`** — HTTP Basic auth (any username, password = your `ADMIN_PASSWORD`).
  Reachable at the app URL (`/admin` is proxied to the backend) or directly at the
  backend's `/admin`.
- **Set `ADMIN_PASSWORD`** as an environment variable on the backend service (Railway →
  Variables, or your server's env). It is intentionally **not** hardcoded. If it is unset,
  the dashboard is **disabled** (returns 503) — it never falls back to a default password.
- Records **metadata only** — never API keys or dataset content.
- Timestamps are shown in **UAE time (GST, UTC+4)**.
- The public `POST /api/analytics/track` endpoint records events; `stats`/`dashboard`/`admin`
  require the password.

---

## Notes / future

- Schema changes today are handled by `create_all` + an "add missing columns" step. For
  renames/drops or complex migrations later, adopt **Alembic**.
- The SQLite file (`*.db`) is gitignored on purpose — the database is never part of the repo.
