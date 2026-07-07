import json

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Required. Must be a PostgreSQL connection string (set via the DATABASE_URL
    # environment variable). There is no SQLite fallback — a missing/invalid value
    # is a hard startup error.
    database_url: str = ""
    # Stored as a raw string so a malformed value can never crash startup.
    # Accepts a JSON array, a comma-separated list, or a single origin.
    cors_origins: str = "http://localhost:3000"
    max_concurrent_llm_calls: int = 5
    # Password for the /admin usage dashboard (override via ADMIN_PASSWORD env var).
    admin_password: str = "SSEL0000"
    # Max upload size in MB (override via MAX_UPLOAD_MB env var).
    max_upload_mb: int = 25

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
