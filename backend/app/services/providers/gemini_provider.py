import time

from google import genai

from app.services.providers.base import LLMProvider


class GeminiProvider(LLMProvider):
    """Google Gemini API provider using the native async client."""

    async def complete(self, prompt: str, system_prompt: str = "", params: dict | None = None) -> dict:
        params = params or {}
        client = genai.Client(api_key=self.api_key)

        # Gemini API requires 'models/' prefix
        model_name = self.model if self.model.startswith("models/") else f"models/{self.model}"

        start = time.time()
        response = await client.aio.models.generate_content(
            model=model_name,
            contents=prompt,
            config=genai.types.GenerateContentConfig(
                system_instruction=system_prompt or None,
                temperature=params.get("temperature", 0.7),
                top_p=params.get("top_p", 1.0),
                max_output_tokens=params.get("max_tokens", 2048),
            ),
        )

        return {
            "response": response.text or "",
            "tokens_used": (response.usage_metadata.total_token_count) if response.usage_metadata else 0,
            "latency_ms": self._timed(start),
        }

    async def complete_with_pdf(
        self, prompt: str, pdf_bytes: bytes, system_prompt: str = "", params: dict | None = None
    ) -> dict:
        params = params or {}
        client = genai.Client(api_key=self.api_key)

        model_name = self.model if self.model.startswith("models/") else f"models/{self.model}"

        pdf_part = genai.types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf")

        start = time.time()
        response = await client.aio.models.generate_content(
            model=model_name,
            contents=[pdf_part, prompt],
            config=genai.types.GenerateContentConfig(
                system_instruction=system_prompt or None,
                temperature=params.get("temperature", 0.2),
                max_output_tokens=params.get("max_tokens", 8192),
            ),
        )

        return {
            "response": response.text or "",
            "tokens_used": (response.usage_metadata.total_token_count) if response.usage_metadata else 0,
            "latency_ms": self._timed(start),
        }
