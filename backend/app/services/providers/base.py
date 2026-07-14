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

    async def complete_with_pdf(
        self, prompt: str, pdf_bytes: bytes, system_prompt: str = "", params: dict | None = None
    ) -> dict:
        """Send a PDF document alongside the prompt. Only implemented by vision/document
        capable providers. Returns {"response": str, "tokens_used": int, "latency_ms": float}."""
        raise NotImplementedError(
            f"{type(self).__name__} does not support PDF input. "
            "Choose a model that supports document/vision processing."
        )

    def _timed(self, start: float) -> float:
        return round((time.time() - start) * 1000, 1)
