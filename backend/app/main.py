from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

from app import __version__
from app.config import settings
from app.gzip_request import GzipRequestMiddleware
from app.ratelimit import limiter
from app.routes import coding, analytics, contact, instructions


@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio
    from app.models.database import init_db, engine
    from app.routes.coding import sweep_temp_files
    await init_db()
    print(f"CAT (Communication Annotation Tool) API started — database: {engine.dialect.name} @ {engine.url.host}")

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


app = FastAPI(
    title="CAT — Communication Annotation Tool",
    version=__version__,
    lifespan=lifespan,
)

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

# Decompress gzip-encoded request bodies (marked with X-CAT-Encoding: gzip) before
# routing, so clients can send bodies past the upstream firewall's content scanner.
# Added last so it is the outermost middleware and inflates the body first. The cap
# matches the upload size limit with headroom for the multipart/JSON envelope.
app.add_middleware(
    GzipRequestMiddleware,
    max_bytes=(settings.max_upload_mb + 2) * 1024 * 1024,
)

app.include_router(coding.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(contact.router, prefix="/api")
app.include_router(instructions.router, prefix="/api")
app.include_router(analytics.admin_router)  # /admin (password protected)


@app.get("/")
async def root():
    return {
        "status": "ok",
        "service": "CAT — Communication Annotation Tool API",
        "version": __version__,
    }
