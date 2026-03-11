from app.services.providers.base import LLMProvider
from app.services.providers.openai_provider import OpenAICompatibleProvider

# Maps user-facing model ID -> (provider_class, api_model_name, base_url or None)
PROVIDER_REGISTRY: dict[str, tuple[type[LLMProvider], str, str | None]] = {
    # OpenAI
    "gpt-4o":           (OpenAICompatibleProvider, "gpt-4o", None),
    "gpt-4o-mini":      (OpenAICompatibleProvider, "gpt-4o-mini", None),
    # Anthropic — uses its own provider
    # "claude-sonnet-4":  (AnthropicProvider, "claude-sonnet-4-20250514", None),
    # "claude-haiku-4.5": (AnthropicProvider, "claude-haiku-4-5-20251001", None),
    # Google — uses its own provider
    # "gemini-2.0-flash": (GoogleProvider, "gemini-2.0-flash", None),
    # "gemini-2.5-pro":   (GoogleProvider, "gemini-2.5-pro-preview-06-05", None),
    # Together AI (Llama) — OpenAI-compatible
    "llama-4-maverick": (OpenAICompatibleProvider, "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8", "https://api.together.xyz/v1"),
    "llama-4-scout":    (OpenAICompatibleProvider, "meta-llama/Llama-4-Scout-17B-16E-Instruct", "https://api.together.xyz/v1"),
    # DeepSeek — OpenAI-compatible
    "deepseek-r1":      (OpenAICompatibleProvider, "deepseek-reasoner", "https://api.deepseek.com"),
    # Mistral — OpenAI-compatible
    "mistral-large":    (OpenAICompatibleProvider, "mistral-large-latest", "https://api.mistral.ai/v1"),
}


def get_provider(model_id: str, api_key: str) -> LLMProvider:
    if model_id not in PROVIDER_REGISTRY:
        raise ValueError(f"Unknown model '{model_id}'. Available: {', '.join(sorted(PROVIDER_REGISTRY))}")

    provider_cls, api_model_name, base_url = PROVIDER_REGISTRY[model_id]
    return provider_cls(api_key=api_key, model=api_model_name, base_url=base_url)
