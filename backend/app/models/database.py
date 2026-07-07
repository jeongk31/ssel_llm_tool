import uuid
import json
from pathlib import Path

from sqlalchemy import Column, String, Text, ForeignKey, DateTime, TypeDecorator, Integer, Boolean
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.sql import func

from app.config import settings


# SQLite doesn't have native JSON — store as text, serialize/deserialize automatically
class JSONField(TypeDecorator):
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return json.dumps(value) if value is not None else None

    def process_result_value(self, value, dialect):
        return json.loads(value) if value is not None else None


# Local SQLite fallback (backend/llm_toolkit.db), independent of the working directory.
_SQLITE_FALLBACK = f"sqlite+aiosqlite:///{Path(__file__).resolve().parents[2] / 'llm_toolkit.db'}"


def _async_url(url: str) -> str:
    """Normalize a DATABASE_URL into a usable async SQLAlchemy URL.

    Managed Postgres (Railway, Heroku, university servers) usually hands out
    `postgres://` or `postgresql://`; SQLAlchemy async needs the asyncpg driver.
    If the value is empty or an unresolved variable reference (e.g. Railway's
    `${{Postgres.DATABASE_URL}}` when no Postgres service exists), fall back to
    local SQLite so the app still boots instead of crashing on import.
    """
    url = (url or "").strip()
    if not url or "${" in url or "://" not in url:
        print(
            f"WARNING: DATABASE_URL is unset or unresolved ({url!r}); falling back to "
            f"local SQLite. Analytics will NOT persist across deploys until a valid "
            f"Postgres DATABASE_URL is provided."
        )
        return _SQLITE_FALLBACK
    if url.startswith("postgres://"):
        return "postgresql+asyncpg://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        return "postgresql+asyncpg://" + url[len("postgresql://"):]
    return url


engine = create_async_engine(_async_url(settings.database_url))
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_migrate_usage_events)


def _migrate_usage_events(conn):
    """Add any newly-introduced usage_events columns to an existing table (SQLite)."""
    from sqlalchemy import inspect
    insp = inspect(conn)
    if "usage_events" not in insp.get_table_names():
        return
    existing = {c["name"] for c in insp.get_columns("usage_events")}
    adds = {
        "ip": "VARCHAR(64)", "country": "VARCHAR(80)", "country_code": "VARCHAR(4)",
        "city": "VARCHAR(120)", "region": "VARCHAR(120)",
        "user_agent": "TEXT", "referer": "TEXT",
    }
    for col, ddl in adds.items():
        if col not in existing:
            conn.exec_driver_sql(f"ALTER TABLE usage_events ADD COLUMN {col} {ddl}")


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


class Project(Base):
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    hypothesis = Column(Text)
    goals = Column(Text)
    codebook = Column(JSONField, default=[])
    prompt_template = Column(Text)
    column_mapping = Column(JSONField, default={})
    models_config = Column(JSONField, default={})
    run_settings = Column(JSONField, default={"runs_per_model": 1, "retries": 1, "aggregation": "majority"})
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())


class PipelineRun(Base):
    __tablename__ = "pipeline_runs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id"))
    status = Column(String(20), default="pending")
    config_snapshot = Column(JSONField, nullable=False)
    progress = Column(JSONField, default={})
    results = Column(JSONField, default=[])
    started_at = Column(DateTime)
    completed_at = Column(DateTime)


class UsageEvent(Base):
    """Developer usage analytics — metadata only (never API keys or dataset content)."""
    __tablename__ = "usage_events"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    event = Column(String(20))            # "visit" | "run"
    session_id = Column(String(64))
    providers = Column(JSONField, default=[])
    models = Column(JSONField, default=[])
    num_models = Column(Integer, default=0)
    runs_per_model = Column(Integer, default=0)
    aggregation = Column(String(20))
    num_variables = Column(Integer, default=0)
    num_rows = Column(Integer, default=0)
    num_episodes = Column(Integer, default=0)
    per_sender = Column(Boolean, default=False)
    # request/location metadata
    ip = Column(String(64))
    country = Column(String(80))
    country_code = Column(String(4))
    city = Column(String(120))
    region = Column(String(120))
    user_agent = Column(Text)
    referer = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
