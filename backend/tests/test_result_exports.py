import io
import os
import tempfile
import unittest
import zipfile
from unittest.mock import patch

import pandas as pd
from fastapi import FastAPI
from fastapi.testclient import TestClient
from openpyxl import load_workbook
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.ratelimit import limiter
from app.routes import coding
from app.services.result_exporter import (
    build_result_frames,
    dataframe_to_xlsx,
    expanded_codebook_labels,
    prepare_coding_dataset,
)


class ResultFrameTests(unittest.TestCase):
    def setUp(self):
        self.source = pd.DataFrame(
            [
                {"session": "A", "turn": 2, "sender": "P2", "message": "second", "condition": "treatment"},
                {"session": "A", "turn": 1, "sender": "P1", "message": "first", "condition": "treatment"},
                {"session": "B", "turn": 1, "sender": "P1", "message": "only", "condition": "control"},
            ]
        )

    def _prepared(self):
        return prepare_coding_dataset(
            self.source,
            message_column="message",
            identifier_columns=["session"],
            identity_column="sender",
            order_column="turn",
            order_direction="asc",
        )

    def test_preprocessing_preserves_source_lineage_and_message_order(self):
        prepared = self._prepared()

        self.assertEqual(prepared.source_episode_indices, [0, 0, 1])
        self.assertEqual(len(prepared.episodes), 2)
        self.assertEqual(prepared.episodes.loc[0, "message"], "[P1] first\n[P2] second")
        self.assertEqual(prepared.episodes.loc[0, "sender"], "P1\nP2")
        self.assertEqual(prepared.episodes.loc[0, "turn"], "1\n2")
        self.assertEqual(prepared.episodes.loc[1, "message"], "[P1] only")

    def test_noncontiguous_source_rows_use_positional_episode_mapping(self):
        source = pd.DataFrame(
            [
                {"episode": "A", "message": "first A"},
                {"episode": "B", "message": "only B"},
                {"episode": "A", "message": "second A"},
            ]
        )
        prepared = prepare_coding_dataset(
            source,
            message_column="message",
            identifier_columns=["episode"],
            identity_column=None,
            order_column=None,
            order_direction="asc",
        )
        primary, _, _ = build_result_frames(
            source_df=source,
            prepared=prepared,
            coded_rows=[
                {"index": 0, "coded": {"label": "A-code"}},
                {"index": 1, "coded": {"label": "B-code"}},
            ],
            codebook=[{"label": "label", "level": "episode"}],
            participants=[],
            message_column="message",
            identifier_columns=["episode"],
            context_columns=[],
        )

        self.assertEqual(prepared.source_episode_indices, [0, 1, 0])
        self.assertEqual(primary["label"].tolist(), ["A-code", "B-code", "A-code"])

    def test_row_as_episode_maps_each_source_row_to_itself(self):
        source = pd.DataFrame(
            [
                {"duplicate_id": 1, "message": "one"},
                {"duplicate_id": 1, "message": "two"},
            ]
        )
        prepared = prepare_coding_dataset(
            source,
            message_column="message",
            identifier_columns=[],
            identity_column=None,
            order_column=None,
            order_direction="asc",
        )

        self.assertEqual(prepared.source_episode_indices, [0, 1])
        pd.testing.assert_frame_equal(prepared.episodes, source)

    def test_primary_repeats_episode_codes_without_changing_source_rows(self):
        source_before = self.source.copy(deep=True)
        primary, compact, names = build_result_frames(
            source_df=self.source,
            prepared=self._prepared(),
            coded_rows=[
                {"index": 0, "coded": {"cooperation": 1, "tone_P1": "warm", "tone_P2": "neutral"}},
                {"index": 1, "coded": {"cooperation": 0, "tone_P1": "cold", "tone_P2": None}},
            ],
            codebook=[
                {"label": "cooperation", "level": "episode"},
                {"label": "tone", "level": "sender"},
            ],
            participants=["P1", "P2"],
            message_column="message",
            identifier_columns=["session"],
            context_columns=["condition"],
            identity_column="sender",
            order_column="turn",
        )

        pd.testing.assert_frame_equal(self.source, source_before)
        self.assertEqual(len(primary), len(self.source))
        self.assertEqual(
            list(primary.columns),
            [*self.source.columns, "cooperation", "tone_P1", "tone_P2"],
        )
        self.assertEqual(primary["cooperation"].tolist(), [1, 1, 0])
        self.assertEqual(primary["tone_P1"].tolist(), ["warm", "warm", "cold"])
        self.assertEqual(names["cooperation"], "cooperation")
        self.assertEqual(
            list(compact.columns),
            ["session", "message", "sender", "turn", "condition", "cooperation", "tone_P1", "tone_P2"],
        )
        self.assertEqual(len(compact), 2)

    def test_missing_ignored_episode_is_retained_with_blank_codes(self):
        source = pd.DataFrame(
            [
                {"episode": 1, "message": ""},
                {"episode": 1, "message": None},
                {"episode": 2, "message": "hello"},
            ]
        )
        prepared = prepare_coding_dataset(
            source,
            message_column="message",
            identifier_columns=["episode"],
            identity_column=None,
            order_column=None,
            order_direction="asc",
        )
        self.assertEqual(prepared.episodes.loc[0, "message"], "\n")

        primary, compact, _ = build_result_frames(
            source_df=source,
            prepared=prepared,
            coded_rows=[{"index": 1, "coded": {"label": "yes"}}],
            codebook=[{"label": "label", "level": "episode"}],
            participants=[],
            message_column="message",
            identifier_columns=["episode"],
            context_columns=[],
        )

        self.assertTrue(pd.isna(primary.loc[0, "label"]))
        self.assertTrue(pd.isna(primary.loc[1, "label"]))
        self.assertEqual(primary.loc[2, "label"], "yes")
        self.assertTrue(pd.isna(compact.loc[0, "label"]))

    def test_latest_duplicate_episode_result_wins(self):
        primary, _, _ = build_result_frames(
            source_df=self.source,
            prepared=self._prepared(),
            coded_rows=[
                {"index": 0, "coded": {"label": "old"}},
                {"index": 0, "coded": {"label": "new"}},
            ],
            codebook=[{"label": "label", "level": "episode"}],
            participants=[],
            message_column="message",
            identifier_columns=["session"],
            context_columns=[],
        )

        self.assertEqual(primary["label"].tolist()[:2], ["new", "new"])

    def test_original_column_collision_gets_unambiguous_coded_suffix(self):
        source = self.source.assign(cooperation=["human", "human", "human"])
        prepared = prepare_coding_dataset(
            source,
            message_column="message",
            identifier_columns=["session"],
            identity_column="sender",
            order_column="turn",
            order_direction="asc",
        )
        primary, _, names = build_result_frames(
            source_df=source,
            prepared=prepared,
            coded_rows=[{"index": 0, "coded": {"cooperation": 1}}],
            codebook=[{"label": "cooperation", "level": "episode"}],
            participants=[],
            message_column="message",
            identifier_columns=["session"],
            context_columns=[],
        )

        self.assertEqual(names["cooperation"], "cooperation_coded")
        self.assertEqual(primary["cooperation"].tolist(), ["human", "human", "human"])
        self.assertEqual(primary["cooperation_coded"].tolist()[:2], [1, 1])

    def test_duplicate_expanded_codebook_labels_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "tone_P1"):
            expanded_codebook_labels(
                [
                    {"label": "tone_P1", "level": "episode"},
                    {"label": "tone", "level": "sender"},
                ],
                ["P1"],
            )

    def test_xlsx_writer_preserves_formula_like_text_as_data(self):
        content = dataframe_to_xlsx(
            pd.DataFrame([{"message": "=HYPERLINK(\"https://example.com\")", "code": 1}]),
            sheet_name="Coded data",
        )
        workbook = load_workbook(io.BytesIO(content), data_only=False)
        cell = workbook["Coded data"]["A2"]

        self.assertEqual(cell.value, '=HYPERLINK("https://example.com")')
        self.assertEqual(cell.data_type, "s")

    def test_xlsx_writer_preserves_formula_like_header_as_data(self):
        content = dataframe_to_xlsx(
            pd.DataFrame([["value"]], columns=["=SUM(A1:A2)"]),
            sheet_name="Coded data",
        )
        workbook = load_workbook(io.BytesIO(content), data_only=False)
        cell = workbook["Coded data"]["A1"]

        self.assertEqual(cell.value, "=SUM(A1:A2)")
        self.assertEqual(cell.data_type, "s")

    def test_xlsx_writer_rejects_oversized_string_instead_of_truncating(self):
        with self.assertRaises(ValueError) as raised:
            dataframe_to_xlsx(
                pd.DataFrame([{"message": "x" * 32_768}]),
                sheet_name="Coded data",
            )

        message = str(raised.exception)
        self.assertIn("cell A2", message)
        self.assertIn("32,768 characters", message)
        self.assertIn("at most 32,767", message)

    def test_xlsx_writer_rejects_xml_illegal_control_character(self):
        with self.assertRaises(ValueError) as raised:
            dataframe_to_xlsx(
                pd.DataFrame([{"message": "before\u000bafter"}]),
                sheet_name="Coded data",
            )

        message = str(raised.exception)
        self.assertIn("cell A2", message)
        self.assertIn("XML-incompatible", message)
        self.assertIn("U+000B", message)


class ResultExportEndpointTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.tempdir_patch = patch.object(
            coding.tempfile,
            "gettempdir",
            return_value=self.temp_dir.name,
        )
        self.tempdir_patch.start()
        coding._uploaded_files.clear()

        app = FastAPI()
        app.state.limiter = limiter
        app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
        app.include_router(coding.router, prefix="/api")
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        coding._uploaded_files.clear()
        self.tempdir_patch.stop()
        self.temp_dir.cleanup()

    def _store_dataset(self):
        content = (
            b"session,turn,sender,message,condition\n"
            b"A,2,P2,second,treatment\n"
            b"A,1,P1,first,treatment\n"
            b"B,1,P1,only,control\n"
        )
        return coding._store_uploaded_file(content, "study.csv", "csv")[0]

    def _payload(self, kind: str):
        return {
            "file_id": self._store_dataset(),
            "message_column": "message",
            "identifier_columns": ["session"],
            "identity_column": "sender",
            "order_column": "turn",
            "order_direction": "asc",
            "context": [{"column": "condition", "description": "treatment arm"}],
            "codebook": [{"label": "cooperation", "type": "binary"}],
            "participants": [],
            "coded_rows": [
                {"index": 0, "coded": {"cooperation": 1}},
                {"index": 1, "coded": {"cooperation": 0}},
            ],
            "kind": kind,
        }

    def test_primary_endpoint_returns_original_rows_in_xlsx(self):
        response = self.client.post("/api/coding/export-results", json=self._payload("primary"))

        self.assertEqual(response.status_code, 200)
        self.assertIn("study_coded.xlsx", response.headers["content-disposition"])
        workbook = load_workbook(io.BytesIO(response.content), data_only=True)
        worksheet = workbook["Coded data"]
        values = list(worksheet.values)
        self.assertEqual(
            values[0],
            ("session", "turn", "sender", "message", "condition", "cooperation"),
        )
        self.assertEqual(len(values) - 1, 3)
        self.assertEqual([row[-1] for row in values[1:]], [1, 1, 0])

    def test_episode_endpoint_contains_only_compact_mapped_columns(self):
        response = self.client.post("/api/coding/export-results", json=self._payload("episodes"))

        self.assertEqual(response.status_code, 200)
        self.assertIn("study_coded_episodes.xlsx", response.headers["content-disposition"])
        workbook = load_workbook(io.BytesIO(response.content), data_only=True)
        values = list(workbook["Coded episodes"].values)
        self.assertEqual(
            values[0],
            ("session", "message", "sender", "turn", "condition", "cooperation"),
        )
        self.assertEqual(values[1][1], "[P1] first\n[P2] second")
        self.assertEqual(values[1][2], "P1\nP2")
        self.assertEqual(values[1][3], "1\n2")
        self.assertEqual(len(values) - 1, 2)

    def test_export_endpoint_rejects_duplicate_expanded_labels(self):
        payload = self._payload("primary")
        payload["codebook"] = [
            {"label": "tone_P1", "type": "text", "level": "episode"},
            {"label": "tone", "type": "text", "level": "sender"},
        ]
        payload["participants"] = ["P1"]

        response = self.client.post("/api/coding/export-results", json=payload)

        self.assertEqual(response.status_code, 400)
        self.assertIn("tone_P1", response.json()["detail"])

    def test_export_endpoint_returns_json_400_for_unrepresentable_xlsx_text(self):
        unsupported_values = [
            ("x" * 32_768, "32,768 characters"),
            ("before\u000bafter", "U+000B"),
        ]

        for value, expected_detail in unsupported_values:
            with self.subTest(expected_detail=expected_detail):
                payload = self._payload("primary")
                payload["coded_rows"][0]["coded"]["cooperation"] = value

                response = self.client.post(
                    "/api/coding/export-results",
                    json=payload,
                )

                self.assertEqual(response.status_code, 400)
                self.assertIn(expected_detail, response.json()["detail"])

    def test_detailed_download_is_restricted_to_coding_result_artifacts(self):
        unrelated = os.path.join(self.temp_dir.name, "unrelated.csv")
        with open(unrelated, "w", encoding="utf-8") as handle:
            handle.write("private\nvalue\n")

        rejected = self.client.get("/api/coding/download", params={"path": unrelated})

        self.assertEqual(rejected.status_code, 403)

        result_dir = tempfile.mkdtemp(prefix="llm_coding_", dir=self.temp_dir.name)
        result_path = os.path.join(result_dir, "coded_results.csv")
        with open(result_path, "w", encoding="utf-8") as handle:
            handle.write("message,label\nhello,yes\n")

        accepted = self.client.get("/api/coding/download", params={"path": result_path})

        self.assertEqual(accepted.status_code, 200)
        self.assertIn("coded_results.csv", accepted.headers["content-disposition"])

    def test_repeated_all_null_detailed_runs_download_without_mode_crash(self):
        result_dir = tempfile.mkdtemp(prefix="llm_coding_", dir=self.temp_dir.name)
        result_path = os.path.join(result_dir, "coded_results.csv")
        with open(result_path, "w", encoding="utf-8") as handle:
            handle.write(
                "message,coder,score,_error\n"
                "hello,openai/model__run1,,api_failed\n"
                "hello,openai/model__run2,,api_failed\n"
            )

        response = self.client.get("/api/coding/download", params={"path": result_path})

        self.assertEqual(response.status_code, 200)
        self.assertIn("coded_results.zip", response.headers["content-disposition"])
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            self.assertEqual(
                sorted(archive.namelist()),
                ["openai_model/run1.csv", "openai_model/run2.csv"],
            )


if __name__ == "__main__":
    unittest.main()
