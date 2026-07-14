import base64
import time

import anthropic

from app.services.providers.base import LLMProvider


class AnthropicProvider(LLMProvider):
    """Anthropic Claude API provider."""

    async def complete(self, prompt: str, system_prompt: str = "", params: dict | None = None) -> dict:
        params = params or {}
        client = anthropic.AsyncAnthropic(api_key=self.api_key)

        start = time.time()
        response = await client.messages.create(
            model=self.model,
            max_tokens=params.get("max_tokens", 2048),
            system=system_prompt or "You are a helpful assistant.",
            messages=[{"role": "user", "content": prompt}],
        )

        return {
            "response": response.content[0].text if response.content else "",
            "tokens_used": (response.usage.input_tokens + response.usage.output_tokens) if response.usage else 0,
            "latency_ms": self._timed(start),
        }

    async def complete_with_pdf(
        self, prompt: str, pdf_bytes: bytes, system_prompt: str = "", params: dict | None = None
    ) -> dict:
        params = params or {}
        client = anthropic.AsyncAnthropic(api_key=self.api_key)
        b64 = base64.standard_b64encode(pdf_bytes).decode("utf-8")

        start = time.time()
        response = await client.messages.create(
            model=self.model,
            max_tokens=params.get("max_tokens", 8192),
            system=system_prompt or "You are a helpful assistant.",
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "document",
                        "source": {"type": "base64", "media_type": "application/pdf", "data": b64},
                    },
                    {"type": "text", "text": prompt},
                ],
            }],
        )

        return {
            "response": response.content[0].text if response.content else "",
            "tokens_used": (response.usage.input_tokens + response.usage.output_tokens) if response.usage else 0,
            "latency_ms": self._timed(start),
        }
