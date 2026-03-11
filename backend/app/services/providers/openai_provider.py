import time

from openai import AsyncOpenAI

from app.services.providers.base import LLMProvider


class OpenAICompatibleProvider(LLMProvider):
    """Works with OpenAI, Together, DeepSeek, Mistral — any OpenAI-compatible API."""

    async def complete(self, prompt: str, system_prompt: str = "", params: dict | None = None) -> dict:
        params = params or {}
        client = AsyncOpenAI(api_key=self.api_key, base_url=self.base_url)

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        start = time.time()
        response = await client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=params.get("temperature", 0.7),
            max_tokens=params.get("max_tokens", 2048),
        )

        return {
            "response": response.choices[0].message.content or "",
            "tokens_used": response.usage.total_tokens if response.usage else 0,
            "latency_ms": self._timed(start),
        }
