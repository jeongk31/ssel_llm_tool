# ChAT — Chat Annotation Toolkit

A web application from the **Social Science Experimental Laboratory (NYU Abu Dhabi)** for
coding qualitative communication data into structured variables using one or more LLMs.
Upload a dataset, map your columns into communication **episodes**, define a **codebook**,
and code every episode with one or more models (with multi-run majority voting), then
download the results or a ready-to-run Python script.

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js (App Router), TypeScript, React |
| Backend | Python, FastAPI, SQLAlchemy (async) |
| Database | PostgreSQL (async via `asyncpg`) — required; see below |
| LLM Providers | OpenAI, Google (Gemini), DeepSeek |
| Styling | Custom CSS design system (no Tailwind) |

## Project structure

```
LLM_TOOL/
├── frontend/                       # Next.js app
│   ├── src/app/
│   │   ├── page.tsx                # Main coding page (upload, mapping, codebook, run)
│   │   ├── globals.css             # Design system
│   │   └── tools/                  # HowToPage, GuidedTour, HelpTip
│   └── next.config.ts              # Proxies /api/* and /admin to the backend
│
├── backend/                        # FastAPI app
│   └── app/
│       ├── main.py                 # App entry, CORS, routers
│       ├── config.py               # Settings (DATABASE_URL, CORS, admin password)
│       ├── models/database.py      # SQLAlchemy: the single `usage_events` table
│       ├── routes/
│       │   ├── coding.py           # /api/coding/upload, /validate, /generate-script,
│       │   │                       #   /download, and the /ws/coding/run WebSocket
│       │   ├── agreement.py        # /api/agreement/cross-check, /compute
│       │   └── analytics.py        # /api/analytics/track + /admin dashboard
│       └── services/
│           ├── coding_runner.py    # Live coding run (streams results)
│           └── script_generator.py # Builds the downloadable standalone script
│
└── DEPLOY.md                       # Storage, Railway / university deployment, /admin
```

## Data storage (important)

The app requires **PostgreSQL**, selected entirely by the `DATABASE_URL` environment
variable — there is **no SQLite fallback**, so a missing/invalid value is a loud startup
error. Only one table (`usage_events`, for usage analytics) is used; it is created
automatically on startup. See **[DEPLOY.md](./DEPLOY.md)** for local, Railway, and
university-server setup and the `/admin` usage dashboard.

## Running locally

```bash
# 1. Postgres (local or Docker) — see DEPLOY.md
export DATABASE_URL=postgresql://<user>@localhost:5432/chat

# 2. Backend
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000

# 3. Frontend (separate terminal)
cd frontend
npm install
npm run dev            # http://localhost:3000
```

API keys for the LLM providers are entered in the app UI per run (never stored server-side).
