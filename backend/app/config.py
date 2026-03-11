from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:///./llm_toolkit.db"
    cors_origins: list[str] = ["http://localhost:3000"]
    max_concurrent_llm_calls: int = 5

    class Config:
        env_file = ".env"


settings = Settings()
