from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes import files, generate, pipeline, coding, agreement, analytics

from fastapi import Request


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.models.database import init_db, engine
    await init_db()
    dialect = engine.dialect.name  # "postgresql" when connected to Postgres, "sqlite" otherwise
    host = engine.url.host or "local file"
    print(f"ChAT (Chat Annotation Toolkit) API started — database: {dialect} @ {host}")
    if dialect == "sqlite":
        print("NOTE: running on SQLite — data will NOT persist across redeploys. "
              "Set DATABASE_URL to your Postgres to persist.")
    yield


app = FastAPI(title="ChAT — Chat Annotation Toolkit", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(files.router, prefix="/api")
app.include_router(generate.router, prefix="/api")
app.include_router(pipeline.router, prefix="/api")
app.include_router(coding.router, prefix="/api")
app.include_router(agreement.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(analytics.admin_router)  # /admin (password protected)



@app.get("/")
async def root():
    return {"status": "ok", "service": "ChAT — Chat Annotation Toolkit API"}



@app.middleware("http")
async def log_origin(request: Request, call_next):
    print(f"ORIGIN: {request.headers.get('origin')}")
    return await call_next(request)