import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.services.coding_runner import _get_provider_instance
from app.services.providers.anthropic_provider import AnthropicProvider
from app.services.providers.openai_provider import OpenAICompatibleProvider
from app.services.providers import get_provider


class ProviderSelectionTests(unittest.TestCase):
    def test_xai_uses_openai_compatible_provider_and_official_endpoint(self):
        provider = _get_provider_instance("xai", "grok-4.5", "test-key")

        self.assertIsInstance(provider, OpenAICompatibleProvider)
        self.assertEqual(provider.model, "grok-4.5")
        self.assertEqual(provider.base_url, "https://api.x.ai/v1")

    def test_anthropic_uses_native_provider(self):
        provider = _get_provider_instance("anthropic", "claude-sonnet-4-6", "test-key")

        self.assertIsInstance(provider, AnthropicProvider)
        self.assertEqual(provider.model, "claude-sonnet-4-6")

    def test_auxiliary_provider_registry_contains_new_models(self):
        claude = get_provider("claude-sonnet-4-6", "test-key")
        grok = get_provider("grok-4.3", "test-key")

        self.assertIsInstance(claude, AnthropicProvider)
        self.assertIsInstance(grok, OpenAICompatibleProvider)
        self.assertEqual(grok.base_url, "https://api.x.ai/v1")


class AnthropicParameterTests(unittest.IsolatedAsyncioTestCase):
    async def test_opus_48_omits_unsupported_sampling_parameters(self):
        create = AsyncMock(return_value=SimpleNamespace(
            content=[SimpleNamespace(type="text", text='{"ok": true}')],
            usage=SimpleNamespace(input_tokens=1, output_tokens=2),
        ))
        fake_client = SimpleNamespace(messages=SimpleNamespace(create=create))

        with patch("app.services.providers.anthropic_provider.anthropic.AsyncAnthropic", return_value=fake_client):
            provider = AnthropicProvider("test-key", "claude-opus-4-8")
            await provider.complete("prompt", params={"temperature": 0.2, "top_p": 0.8, "max_tokens": 50})

        request = create.await_args.kwargs
        self.assertNotIn("temperature", request)
        self.assertNotIn("top_p", request)
        self.assertEqual(request["max_tokens"], 50)

    async def test_sonnet_46_sends_only_one_sampling_parameter(self):
        create = AsyncMock(return_value=SimpleNamespace(
            content=[SimpleNamespace(type="text", text='{"ok": true}')],
            usage=SimpleNamespace(input_tokens=1, output_tokens=2),
        ))
        fake_client = SimpleNamespace(messages=SimpleNamespace(create=create))

        with patch("app.services.providers.anthropic_provider.anthropic.AsyncAnthropic", return_value=fake_client):
            provider = AnthropicProvider("test-key", "claude-sonnet-4-6")
            await provider.complete("prompt", params={"temperature": 0.2, "top_p": 0.8})

        request = create.await_args.kwargs
        self.assertEqual(request["temperature"], 0.2)
        self.assertNotIn("top_p", request)


if __name__ == "__main__":
    unittest.main()
