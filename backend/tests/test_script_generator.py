import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

import pandas as pd
from openpyxl import load_workbook

from app.services.script_generator import generate_coding_script


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
            patch.dict(os.environ, {"CHAT_API_KEY": "test-key"}),
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

    def test_xlsx_writer_keeps_formula_like_headers_and_values_literal(self):
        script = generate_coding_script(
            file_name="input.csv",
            message_column="message",
            experiment_instructions="Study instructions",
            coding_instructions="",
            codebook=[{"label": "category", "type": "text"}],
            provider="openai",
            model="test-model",
            api_key="must-not-appear",
        )
        namespace = self._execute_generated_script(script)

        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "literal.xlsx"
            frame = pd.DataFrame(
                [["=2+2", "ordinary"]],
                columns=['=HYPERLINK("https://example.test")', "plain"],
            )

            namespace["write_literal_xlsx"](
                frame,
                str(output_path),
                "Coded data",
            )

            worksheet = load_workbook(output_path, data_only=False)["Coded data"]
            self.assertEqual(worksheet["A1"].value, '=HYPERLINK("https://example.test")')
            self.assertEqual(worksheet["A1"].data_type, "s")
            self.assertEqual(worksheet["A2"].value, "=2+2")
            self.assertEqual(worksheet["A2"].data_type, "s")

    def test_xlsx_writer_rejects_lossy_or_xml_invalid_text_before_writing(self):
        script = generate_coding_script(
            file_name="input.csv",
            message_column="message",
            experiment_instructions="Study instructions",
            coding_instructions="",
            codebook=[{"label": "category", "type": "text"}],
            provider="openai",
            model="test-model",
            api_key="must-not-appear",
        )
        namespace = self._execute_generated_script(script)

        with tempfile.TemporaryDirectory() as temp_dir:
            long_path = Path(temp_dir) / "too-long.xlsx"
            with self.assertRaisesRegex(ValueError, "32,767"):
                namespace["write_literal_xlsx"](
                    pd.DataFrame([["x" * 32768]], columns=["message"]),
                    str(long_path),
                    "Coded data",
                )
            self.assertFalse(long_path.exists())

            invalid_path = Path(temp_dir) / "invalid-xml.xlsx"
            with self.assertRaisesRegex(ValueError, "U\\+0000"):
                namespace["write_literal_xlsx"](
                    pd.DataFrame([["before\x00after"]], columns=["message"]),
                    str(invalid_path),
                    "Coded data",
                )
            self.assertFalse(invalid_path.exists())


if __name__ == "__main__":
    unittest.main()
