import uuid
import json

from sqlalchemy import Column, String, Text, ForeignKey, DateTime, TypeDecorator
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


engine = create_async_engine(settings.database_url)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


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
