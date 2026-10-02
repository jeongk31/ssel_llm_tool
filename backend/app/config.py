import json

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

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

    # ── Server-side coding runs ──────────────────────────────────────────────
    # Absolute URL of the public site, used to build run links in email.
    # Without it CAT still runs jobs; it just cannot write a usable link.
    public_base_url: str = ""
    # How long a run link — and the results behind it — stay available.
    run_link_ttl_hours: int = 48
    # Ceiling on a single server-side run, so a forgotten run cannot bill without
    # bound against the researcher's API key.
    max_detached_episodes: int = 5000
    # How many server-side runs may execute at once on this one process.
    max_concurrent_jobs: int = 3

    # ── Outgoing mail ────────────────────────────────────────────────────────
    # When smtp_host is empty CAT never sends email: server-side runs still work
    # and their links still work, the notification is simply skipped. That keeps
    # the feature usable before the mail relay is approved.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_starttls: bool = True
    # An @nyu.edu sender inherits the university's existing SPF/DKIM, so the mail
    # authenticates. A ssel.nyuad.nyu.edu address would need its own DNS records
    # added first — that subdomain has no MX and no SPF today.
    mail_from: str = "cat-noreply@nyu.edu"
    mail_from_name: str = "CAT — Communication Annotation Tool"

    @property
    def mail_configured(self) -> bool:
        return bool(self.smtp_host.strip() and self.mail_from.strip())

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
