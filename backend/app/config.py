import json
from pathlib import Path

from pydantic_settings import BaseSettings

# Anchor the DB to the backend directory (this file is backend/app/config.py) so
# the usage data lives in the same file regardless of the working directory the
# server is launched from.
_DB_FILE = Path(__file__).resolve().parent.parent / "llm_toolkit.db"


class Settings(BaseSettings):
    database_url: str = f"sqlite+aiosqlite:///{_DB_FILE}"
    # Stored as a raw string so a malformed value can never crash startup.
    # Accepts a JSON array, a comma-separated list, or a single origin.
    cors_origins: str = "http://localhost:3000"
    max_concurrent_llm_calls: int = 5

    class Config:
        env_file = ".env"
        extra = "ignore"

    @property
    def cors_origins_list(self) -> list[str]:
        s = self.cors_origins.strip()
        if not s:
            return ["http://localhost:3000"]
        if s.startswith("["):
            try:
                return json.loads(s)
            except json.JSONDecodeError:
                pass
        return [o.strip() for o in s.split(",") if o.strip()]


settings = Settings()
