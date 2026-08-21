import os
import sys
import types
import unittest
from unittest.mock import patch

from app.services.script_generator import _get_provider_code, generate_coding_script


class GeneratedScriptSafetyTests(unittest.TestCase):
    @staticmethod
    def _execute_generated_script(script: str) -> dict:
        fake_openai = types.ModuleType("openai")

        class FakeOpenAI:
            def __init__(self, **kwargs):
                self.kwargs = kwargs

        fake_openai.OpenAI = FakeOpenAI
        namespace = {"__name__": "generated_chat_test"}
        with (
            patch.dict(os.environ, {"CAT_API_KEY": "test-key"}),
            patch.dict(sys.modules, {"openai": fake_openai}),
        ):
            exec(compile(script, "generated_chat_test.py", "exec"), namespace)
        return namespace

    def test_user_text_is_valid_python_and_preserved_exactly_at_runtime(self):
        file_name = 'C:\\research\\trial\\data """ $\\alpha$\\'
        message_column = 'message """ C:\\columns\\ $\\alpha$\\'
        identifier = 'episode """ C:\\ids\\'
        identity = 'sender """ C:\\people\\'
        order = 'turn """ C:\\order\\'
        participant = 'P1 """ $\\alpha$\\'
        label = 'cooperation """ $\\alpha$\\'
        experiment_instructions = (
            'Read C:\\study\\assets\\ and preserve $\\alpha$; '
            'the phrase """quoted"""; trailing slash\\'
        )
        coding_instructions = (
            'Code C:\\rules\\ literally, including $\\beta$, """text""", and \\'
        )
        codebook = [
            {
                "label": label,
                "type": "categorical",
                "level": "episode",
                "definition": 'Definition """ C:\\defs\\ $\\gamma$\\',
                "values": [
                    {
                        "value": 'yes """ C:\\values\\',
                        "definition": 'Value """ $\\delta$\\',
                    }
                ],
            }
        ]
        context = [
            {
                "column": 'condition """ C:\\context\\',
                "description": 'Study arm """ $\\epsilon$\\',
            }
        ]
        model = 'model """ C:\\models\\ $\\alpha$\\'

        script = generate_coding_script(
            file_name=file_name,
            message_column=message_column,
            experiment_instructions=experiment_instructions,
            coding_instructions=coding_instructions,
            codebook=codebook,
            provider="openai",
            model=model,
            api_key="must-not-appear",
            identifier_columns=[identifier],
            identity_column=identity,
            order_column=order,
            order_direction="desc",
            participants=[participant],
            context=context,
            empty_message_handling="code",
            compact_columns=[identifier, message_column, identity, order, context[0]["column"]],
        )

        namespace = self._execute_generated_script(script)

        self.assertEqual(namespace["FILE_NAME"], file_name)
        self.assertEqual(namespace["MESSAGE_COLUMN"], message_column)
        self.assertEqual(namespace["IDENTIFIER_COLUMNS"], [identifier])
        self.assertEqual(namespace["IDENTITY_COLUMN"], identity)
        self.assertEqual(namespace["ORDER_COLUMN"], order)
        self.assertEqual(namespace["EXPERIMENT_INSTRUCTIONS"], experiment_instructions)
        self.assertEqual(namespace["CODING_INSTRUCTIONS"], coding_instructions)
        self.assertEqual(namespace["CODEBOOK"], codebook)
        self.assertEqual(namespace["CONTEXT"], context)
        self.assertEqual(namespace["PROVIDER"], "openai")
        self.assertEqual(namespace["MODEL"], model)
        self.assertNotIn(file_name, namespace["__doc__"])
        self.assertNotIn(message_column, namespace["__doc__"])
        self.assertNotIn("must-not-appear", script)

    def test_package_uses_three_csv_inputs_and_runtime_api_key(self):
        script = generate_coding_script(
            file_name="episodes.csv",
            message_column="message",
            experiment_instructions="Study instructions",
            coding_instructions="",
            codebook=[{"label": "category", "type": "text"}],
            provider="openai",
            model="test-model",
            package_source_file="source_rows.csv",
            package_episode_file="episodes.csv",
            package_row_map_file="row_map.csv",
            compact_columns=["message"],
            result_stem="study",
        )
        namespace = self._execute_generated_script(script)

        self.assertTrue(namespace["PACKAGE_MODE"])
        self.assertEqual(namespace["PACKAGE_SOURCE_FILE"], "source_rows.csv")
        self.assertEqual(namespace["PACKAGE_EPISODE_FILE"], "episodes.csv")
        self.assertEqual(namespace["PACKAGE_ROW_MAP_FILE"], "row_map.csv")
        self.assertIn("load_package_csvs", namespace)
        self.assertNotIn("must-not-appear", script)

    def test_package_requires_all_three_csv_filenames(self):
        with self.assertRaisesRegex(ValueError, "source, episode, and row-map"):
            generate_coding_script(
                file_name="episodes.csv",
                message_column="message",
                experiment_instructions="Study instructions",
                coding_instructions="",
                codebook=[{"label": "category", "type": "text"}],
                provider="openai",
                model="test-model",
                package_source_file="source_rows.csv",
            )

    def test_xai_package_uses_the_official_openai_compatible_endpoint(self):
        imports, setup, call = _get_provider_code("xai")

        self.assertEqual(imports, "from openai import OpenAI")
        self.assertIn('base_url="https://api.x.ai/v1"', setup)
        self.assertIn("client.chat.completions.create", call)
        self.assertNotIn("temperature=", call)

    def test_anthropic_package_uses_the_anthropic_sdk(self):
        imports, setup, call = _get_provider_code("anthropic")

        self.assertEqual(imports, "import anthropic")
        self.assertIn("anthropic.Anthropic", setup)
        self.assertIn("client.messages.create", call)


if __name__ == "__main__":
    unittest.main()
