# Deployment & Data Storage

ChAT (Chat Annotation Toolkit) stores everything — including usage analytics — in a
SQL database selected entirely by the **`DATABASE_URL`** environment variable. The same
code runs on every environment; only that variable changes.

| Environment | `DATABASE_URL` | Persistence |
|---|---|---|
| Local dev | *(unset)* → SQLite file at `backend/llm_toolkit.db` | Survives restarts on your machine |
| Railway | `${{Postgres.DATABASE_URL}}` (managed Postgres) | Survives every deploy |
| University server | Postgres URL you provide | Survives redeploys |

The app auto-upgrades `postgres://` / `postgresql://` URLs to the async `postgresql+asyncpg://`
driver, so you can paste a managed-Postgres URL verbatim.

## Tables are created automatically

On startup the backend runs `Base.metadata.create_all`, which creates any missing tables
(`projects`, `pipeline_runs`, `usage_events`). You never run SQL by hand. A lightweight
migration also adds any newly-introduced `usage_events` columns to an existing table.

> Tables only appear **after the backend boots while connected to the target database.**
> An empty database usually means it hasn't been redeployed yet, `DATABASE_URL` isn't
> resolving, or startup crashed — check the deploy logs.

---

## Local development

Nothing to configure. With no `DATABASE_URL`, data goes to `backend/llm_toolkit.db`
(an absolute path, so it's the same file regardless of the directory you launch from).
The file is gitignored, so it never syncs to GitHub.

```bash
cd backend
python -m uvicorn app.main:app --reload --port 8000
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
value; the deploy logs show `ChAT (Chat Annotation Toolkit) API started` with no traceback;
and the Postgres service's **Data** tab lists the three tables.

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

- Dashboard: **`/admin`** — HTTP Basic auth, password **`SSEL0000`** (any username).
  Reachable at the app URL (`/admin` is proxied to the backend) or directly at the
  backend's `/admin`.
- Records **metadata only** — never API keys or dataset content.
- Timestamps are shown in **UAE time (GST, UTC+4)**.
- The public `POST /api/analytics/track` endpoint records events; `stats`/`dashboard`/`admin`
  require the password.

To change the admin password, edit `ADMIN_PASSWORD` in `backend/app/routes/analytics.py`
(or lift it to an env var if you prefer not to hardcode it).

---

## Notes / future

- Schema changes today are handled by `create_all` + an "add missing columns" step. For
  renames/drops or complex migrations later, adopt **Alembic**.
- The SQLite file (`*.db`) is gitignored on purpose — the database is never part of the repo.
