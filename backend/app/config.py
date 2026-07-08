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
    # Password for the /admin usage dashboard. MUST be set via the ADMIN_PASSWORD
    # env var — if empty, the /admin dashboard is disabled (denies all access).
    admin_password: str = ""
    # Max upload size in MB (override via MAX_UPLOAD_MB env var).
    max_upload_mb: int = 25
    # Contact form → email (SMTP). Set these env vars to enable the form; if any of
    # host/user/password is missing the endpoint returns 503 (form disabled).
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    contact_to: str = "jkl499@nyu.edu"
    contact_from: str = ""  # defaults to smtp_user when empty

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
