import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pandas as pd

from app.services.coding_runner import _get_provider_instance, run_coding
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


class CodingRunnerParameterTests(unittest.IsolatedAsyncioTestCase):
    async def _run_with_slot(self, slot):
        provider = SimpleNamespace(complete=AsyncMock(return_value={"response": '{"flag": 1}'}))
        with patch("app.services.coding_runner._get_provider_instance", return_value=provider):
            updates = [
                update
                async for update in run_coding(
                    df=pd.DataFrame([{"message": "hello"}]),
                    message_column="message",
                    experiment_instructions="",
                    coding_instructions="",
                    codebook=[{"label": "flag", "type": "binary", "aggregation": "mode"}],
                    model_slots=[{
                        "provider": "openai",
                        "model": "test-model",
                        "api_key": "test-key",
                        **slot,
                    }],
                    max_retries=1,
                )
            ]
        self.assertTrue(any(update.get("type") == "complete" for update in updates))
        return provider.complete.await_args.kwargs["params"]

    async def test_explicit_zero_sampling_values_reach_provider(self):
        params = await self._run_with_slot({
            "temperature": 0,
            "top_p": 0,
            "max_tokens": 64,
            "generation_config": {"temperature": 0.7, "topP": 0.8, "maxOutputTokens": 128},
        })

        self.assertEqual(params, {"temperature": 0, "top_p": 0, "max_tokens": 64})

    async def test_omitted_sampling_values_use_provider_defaults(self):
        params = await self._run_with_slot({})

        self.assertEqual(params, {"temperature": 0.1, "top_p": 1.0, "max_tokens": 2048})


class CodingRunnerAggregationTests(unittest.IsolatedAsyncioTestCase):
    async def test_repeated_calls_stream_wide_nontext_aggregates_without_text(self):
        provider = SimpleNamespace(complete=AsyncMock(side_effect=[
            {"response": '{"option": "a", "score": 1, "note": "first"}'},
            {"response": '{"option": "b", "score": 2, "note": "second"}'},
        ]))
        codebook = [
            {
                "label": "option",
                "type": "categorical",
                "aggregation": "mode",
                "values": [{"value": "a"}, {"value": "b"}],
            },
            {"label": "score", "type": "numeric", "aggregation": "mode"},
            {"label": "note", "type": "text", "aggregation": "mode"},
        ]

        with patch("app.services.coding_runner._get_provider_instance", return_value=provider):
            updates = [
                update
                async for update in run_coding(
                    df=pd.DataFrame([{"message": "hello"}]),
                    message_column="message",
                    experiment_instructions="",
                    coding_instructions="",
                    codebook=codebook,
                    model_slots=[{"provider": "openai", "model": "test-model", "api_key": "test-key"}],
                    runs_per_model=2,
                    max_retries=1,
                )
            ]

        row = next(update for update in updates if update.get("type") == "row")
        self.assertEqual(row["coded"]["option_a"], 0.5)
        self.assertEqual(row["coded"]["option_b"], 0.5)
        self.assertEqual(row["coded"]["score"], 1.5)
        self.assertNotIn("note", row["coded"])

    async def test_single_call_streams_original_values_including_text(self):
        provider = SimpleNamespace(complete=AsyncMock(return_value={
            "response": '{"option": "a", "score": 1, "note": "unchanged"}'
        }))
        codebook = [
            {
                "label": "option",
                "type": "categorical",
                "aggregation": "mode",
                "values": [{"value": "a"}, {"value": "b"}],
            },
            {"label": "score", "type": "numeric", "aggregation": "mode"},
            {"label": "note", "type": "text", "aggregation": "mode"},
        ]

        with patch("app.services.coding_runner._get_provider_instance", return_value=provider):
            updates = [
                update
                async for update in run_coding(
                    df=pd.DataFrame([{"message": "hello"}]),
                    message_column="message",
                    experiment_instructions="",
                    coding_instructions="",
                    codebook=codebook,
                    model_slots=[{"provider": "openai", "model": "test-model", "api_key": "test-key"}],
                    runs_per_model=1,
                    max_retries=1,
                )
            ]

        row = next(update for update in updates if update.get("type") == "row")
        self.assertEqual(
            row["coded"],
            {"option": "a", "score": 1, "note": "unchanged"},
        )


if __name__ == "__main__":
    unittest.main()
