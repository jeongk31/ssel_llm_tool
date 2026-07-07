from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

from app.config import settings
from app.ratelimit import limiter
from app.routes import files, generate, coding, agreement, analytics


@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio
    from app.models.database import init_db, engine
    from app.routes.coding import sweep_temp_files
    await init_db()
    print(f"ChAT (Chat Annotation Toolkit) API started — database: {engine.dialect.name} @ {engine.url.host}")

    async def _temp_sweeper():
        while True:
            try:
                sweep_temp_files()
            except Exception as e:
                print(f"temp sweep error: {e}")
            await asyncio.sleep(3600)  # hourly; deletes working files older than 24h

    sweeper = asyncio.create_task(_temp_sweeper())
    try:
        yield
    finally:
        sweeper.cancel()


app = FastAPI(title="ChAT — Chat Annotation Toolkit", lifespan=lifespan)

# Rate limiting (public endpoints are decorated in their routers).
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(files.router, prefix="/api")
app.include_router(generate.router, prefix="/api")
app.include_router(coding.router, prefix="/api")
app.include_router(agreement.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(analytics.admin_router)  # /admin (password protected)


@app.get("/")
async def root():
    return {"status": "ok", "service": "ChAT — Chat Annotation Toolkit API"}