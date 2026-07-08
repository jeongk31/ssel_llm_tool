import uuid
import json

from sqlalchemy import Column, String, Text, DateTime, TypeDecorator, Integer, Boolean
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.sql import func

from app.config import settings


# Store JSON as text and serialize/deserialize automatically (portable across backends)
class JSONField(TypeDecorator):
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return json.dumps(value) if value is not None else None

    def process_result_value(self, value, dialect):
        return json.loads(value) if value is not None else None


def _async_url(url: str) -> str:
    """Require a PostgreSQL DATABASE_URL and return an async (asyncpg) SQLAlchemy URL.

    There is NO SQLite fallback: a missing, unresolved, or non-Postgres value raises
    a clear error at startup so misconfiguration is loud instead of silently using a
    throwaway database. Managed Postgres hands out `postgres://` / `postgresql://`;
    SQLAlchemy async needs the asyncpg driver.
    """
    url = (url or "").strip()
    if not url:
        raise RuntimeError(
            "DATABASE_URL is not set. This app requires a PostgreSQL database. "
            "Set DATABASE_URL to your Postgres connection string "
            "(on Railway: add a Postgres service, then set DATABASE_URL=${{Postgres.DATABASE_URL}} "
            "on the backend service and redeploy)."
        )
    if "${" in url:
        raise RuntimeError(
            f"DATABASE_URL is unresolved ({url!r}). The Postgres variable reference did not "
            "resolve to a real value. Confirm the referenced service name is correct and that "
            "the Postgres and backend services are in the same project/environment, then redeploy."
        )
    if url.startswith("postgres://"):
        return "postgresql+asyncpg://" + url[len("postgres://"):]
    if url.startswith("postgresql+"):  # already carries a driver (e.g. +asyncpg / +psycopg)
        return url
    if url.startswith("postgresql://"):
        return "postgresql+asyncpg://" + url[len("postgresql://"):]
    scheme = url.split("://", 1)[0] if "://" in url else url
    raise RuntimeError(
        f"DATABASE_URL must be a PostgreSQL URL (postgres:// or postgresql://), got scheme {scheme!r}."
    )


engine = create_async_engine(_async_url(settings.database_url))
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(_drop_legacy_tables)
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_migrate_usage_events)


def _drop_legacy_tables(conn):
    """The app only needs `usage_events`; drop unused legacy tables if present."""
    for table in ("pipeline_runs", "projects"):
        conn.exec_driver_sql(f"DROP TABLE IF EXISTS {table}")


def _migrate_usage_events(conn):
    """Add any newly-introduced usage_events columns to an existing table."""
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


class ContactMessage(Base):
    """Questions/concerns submitted through the contact form, managed in /admin."""
    __tablename__ = "contact_messages"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(120))
    email = Column(String(200))
    title = Column(String(200))
    body = Column(Text)
    status = Column(String(20), default="unresolved")  # "unresolved" | "resolved"
    created_at = Column(DateTime, server_default=func.now())
