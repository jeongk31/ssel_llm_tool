# LLM Measurement Toolkit — SSELab

A web application for converting qualitative communication episodes into structured experimental variables using multiple LLMs with weighted majority voting.

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), TypeScript, React |
| Backend | Python, FastAPI, SQLAlchemy (async) |
| Database | SQLite (via aiosqlite) |
| LLM Providers | OpenAI, Anthropic, Google, Together AI, DeepSeek, Mistral |
| Styling | Custom CSS design system (no Tailwind) |

## Project Structure

```
LLM_TOOL/
├── frontend/                   # Next.js app
│   ├── src/app/
│   │   ├── layout.tsx          # Root layout
│   │   ├── page.tsx            # Main Build & Run page
│   │   └── globals.css         # Full design system (CSS custom properties)
│   ├── src/lib/
│   │   └── api.ts              # API client helper
│   ├── next.config.ts          # Proxies /api/* to backend
│   └── public/
│       └── ssel_logo.png
│
├── backend/                    # FastAPI app
│   ├── app/
│   │   ├── main.py             # App entry, CORS, routers
│   │   ├── config.py           # Settings (DB URL, CORS origins)
│   │   ├── models/
│   │   │   └── database.py     # SQLAlchemy models (Project, PipelineRun)
│   │   ├── routes/
│   │   │   ├── files.py        # POST /api/files/upload
│   │   │   ├── generate.py     # POST /api/generate/codebook, /prompt
│   │   │   └── pipeline.py     # POST /api/pipeline/run, WebSocket
│   │   └── services/providers/
│   │       ├── base.py         # Abstract LLMProvider
│   │       ├── openai_provider.py  # OpenAI-compatible provider
│   │       └── __init__.py     # Provider registry + factory
│   ├── requirements.txt
│   └── .env                    # Local config
│
├── index.html                  # Original static prototype (reference)
├── script.js                   # Original static prototype (reference)
└── styles.css                  # Original static prototype (reference)
```

## Prerequisites

- **Node.js** 18+ (`brew install node`)
- **Python** 3.12+ (`python3 --version`)
- **pip** (`pip3 --version`)

## Setup

### Backend

```bash
cd backend
pip3 install -r requirements.txt
```

The SQLite database (`llm_toolkit.db`) is created automatically on first run.

### Frontend

```bash
cd frontend
npm install
```

## Running

Open two terminal windows:

**Terminal 1 — Backend** (port 8000):
```bash
cd backend
uvicorn app.main:app --reload
```

**Terminal 2 — Frontend** (port 3000):
```bash
cd frontend
npm run dev
```

Open http://localhost:3000

## API Documentation

With the backend running, interactive API docs are at:

- **Swagger UI**: http://localhost:8000/docs
- **OpenAPI spec**: http://localhost:8000/openapi.json

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check |
| POST | `/api/files/upload` | Upload CSV/Excel, returns parsed preview + columns |
| POST | `/api/generate/codebook` | AI-generate codebook from experiment details |
| POST | `/api/generate/prompt` | AI-generate measurement prompt |
| POST | `/api/pipeline/run` | Start a pipeline run |
| WS | `/api/ws/pipeline/{run_id}` | Stream pipeline progress in real-time |

## How It Connects

```
Browser (localhost:3000)
  │
  ├── Page loads ──────► Next.js (frontend)
  │
  ├── /api/* calls ────► Next.js proxy ────► FastAPI (localhost:8000)
  │
  └── WebSocket ───────► Direct to FastAPI (ws://localhost:8000)
```

The frontend proxies all `/api/*` requests to the backend via `next.config.ts` rewrites. API keys entered by users are sent per-request and never stored.

## Environment Variables

**Backend** (`backend/.env`):
```
DATABASE_URL=sqlite+aiosqlite:///./llm_toolkit.db
CORS_ORIGINS=["http://localhost:3000"]
```
