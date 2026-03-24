from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes import files, generate, pipeline, encoding


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.models.database import init_db
    await init_db()
    print("LLM Measurement Toolkit API started (SQLite)")
    yield


app = FastAPI(title="LLM Measurement Toolkit", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(files.router, prefix="/api")
app.include_router(generate.router, prefix="/api")
app.include_router(pipeline.router, prefix="/api")
app.include_router(encoding.router, prefix="/api")


@app.get("/")
async def root():
    return {"status": "ok", "service": "LLM Measurement Toolkit API"}
