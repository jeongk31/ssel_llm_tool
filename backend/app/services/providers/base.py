import time
from abc import ABC, abstractmethod


class LLMProvider(ABC):
    def __init__(self, api_key: str, model: str, base_url: str | None = None):
        self.api_key = api_key
        self.model = model
        self.base_url = base_url

    @abstractmethod
    async def complete(self, prompt: str, system_prompt: str = "", params: dict | None = None) -> dict:
        """Returns {"response": str, "tokens_used": int, "latency_ms": float}"""

    def _timed(self, start: float) -> float:
        return round((time.time() - start) * 1000, 1)
