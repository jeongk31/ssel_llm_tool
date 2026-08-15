from app.services.providers.base import LLMProvider
from app.services.providers.openai_provider import OpenAICompatibleProvider
from app.services.providers.anthropic_provider import AnthropicProvider
from app.services.providers.gemini_provider import GeminiProvider


# Maps user-facing model ID -> (provider_class, api_model_name, base_url or None)
PROVIDER_REGISTRY: dict[str, tuple[type[LLMProvider], str, str | None]] = {
    # OpenAI
    "gpt-4.1":          (OpenAICompatibleProvider, "gpt-4.1", None),
    "gpt-4.1-mini":     (OpenAICompatibleProvider, "gpt-4.1-mini", None),
    "gpt-4.1-nano":     (OpenAICompatibleProvider, "gpt-4.1-nano", None),
    "gpt-4o":           (OpenAICompatibleProvider, "gpt-4o", None),
    "gpt-4o-mini":      (OpenAICompatibleProvider, "gpt-4o-mini", None),
    # Anthropic
    "claude-opus-4-8":  (AnthropicProvider, "claude-opus-4-8", None),
    "claude-sonnet-4-6":(AnthropicProvider, "claude-sonnet-4-6", None),
    "claude-haiku-4-5-20251001": (AnthropicProvider, "claude-haiku-4-5-20251001", None),
    # Google
    "gemini-3.1-pro":   (GeminiProvider, "gemini-3.1-pro-preview", None),
    "gemini-3-flash":   (GeminiProvider, "gemini-3-flash-preview", None),
    "gemini-2.5-pro":   (GeminiProvider, "gemini-2.5-pro", None),
    "gemini-2.5-flash": (GeminiProvider, "gemini-2.5-flash", None),
    # Together AI (Llama) — OpenAI-compatible
    "llama-4-maverick": (OpenAICompatibleProvider, "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8", "https://api.together.xyz/v1"),
    "llama-4-scout":    (OpenAICompatibleProvider, "meta-llama/Llama-4-Scout-17B-16E-Instruct", "https://api.together.xyz/v1"),
    # DeepSeek — OpenAI-compatible
    "deepseek-chat":    (OpenAICompatibleProvider, "deepseek-chat", "https://api.deepseek.com"),
    "deepseek-reasoner":(OpenAICompatibleProvider, "deepseek-reasoner", "https://api.deepseek.com"),
    # xAI (Grok) — OpenAI-compatible
    "grok-4.5":         (OpenAICompatibleProvider, "grok-4.5", "https://api.x.ai/v1"),
    "grok-4.3":         (OpenAICompatibleProvider, "grok-4.3", "https://api.x.ai/v1"),
    # Mistral — OpenAI-compatible
    "mistral-large":    (OpenAICompatibleProvider, "mistral-large-latest", "https://api.mistral.ai/v1"),
    "mistral-small":    (OpenAICompatibleProvider, "mistral-small-latest", "https://api.mistral.ai/v1"),
}


def get_provider(model_id: str, api_key: str) -> LLMProvider:
    if model_id not in PROVIDER_REGISTRY:
        raise ValueError(f"Unknown model '{model_id}'. Available: {', '.join(sorted(PROVIDER_REGISTRY))}")

    provider_cls, api_model_name, base_url = PROVIDER_REGISTRY[model_id]
    return provider_cls(api_key=api_key, model=api_model_name, base_url=base_url)
