import unittest

import pandas as pd

from app.services.agreement import (
    agreement_and_kappa,
    agreement_report_frame,
    build_inter_coder_agreement,
)


class InterCoderAgreementTests(unittest.TestCase):
    codebook = [
        {
            "label": "cooperation",
            "type": "binary",
            "level": "episode",
            "aggregation": "mode",
        },
        {
            "label": "score",
            "type": "numeric",
            "level": "episode",
            "aggregation": "mean",
        },
        {
            "label": "note",
            "type": "text",
            "level": "episode",
            "aggregation": "mode",
        },
    ]

    def test_agreement_and_kappa_use_paired_complete_values(self):
        agreement, kappa, paired_n = agreement_and_kappa(
            pd.Series([1, 0, 1, None]),
            pd.Series([1, 1, 0, 1]),
        )

        self.assertEqual(paired_n, 3)
        self.assertAlmostEqual(agreement, 100 / 3)
        self.assertAlmostEqual(kappa, -0.5)

    def test_constant_identical_values_report_agreement_but_undefined_kappa(self):
        agreement, kappa, paired_n = agreement_and_kappa(
            pd.Series([1, 1, 1]),
            pd.Series([1, 1, 1]),
        )

        self.assertEqual((agreement, paired_n), (100, 3))
        self.assertIsNone(kappa)

    def test_kappa_matches_a_known_confusion_example(self):
        agreement, kappa, paired_n = agreement_and_kappa(
            pd.Series(["a", "a", "a", "b", "b", "b", "c", "c", "c", "c"]),
            pd.Series(["a", "a", "b", "b", "b", "c", "c", "c", "c", "c"]),
        )

        self.assertEqual(paired_n, 10)
        self.assertAlmostEqual(agreement, 80.0)
        self.assertAlmostEqual(kappa, 9 / 13)

    def test_unequal_category_sets_are_included_in_expected_agreement(self):
        agreement, kappa, paired_n = agreement_and_kappa(
            pd.Series(["a", "a", "b", "b"]),
            pd.Series(["a", "c", "c", "b"]),
        )

        self.assertEqual(paired_n, 4)
        self.assertEqual(agreement, 50.0)
        self.assertAlmostEqual(kappa, 1 / 3)

    def test_no_paired_values_returns_undefined_statistics(self):
        agreement, kappa, paired_n = agreement_and_kappa(
            pd.Series([None, 1]),
            pd.Series([0, None]),
        )

        self.assertEqual(paired_n, 0)
        self.assertIsNone(agreement)
        self.assertIsNone(kappa)

    def test_runs_are_aggregated_within_model_before_pairwise_comparison(self):
        records = []
        model_values = {
            "openai/model": [
                [1, 1, 1],
                [0, 0, 1],
                [1, 1, 0],
            ],
            "gemini/model": [
                [1, 1, 0],
                [1, 1, 0],
                [0, 0, 1],
            ],
        }
        for model, episodes in model_values.items():
            for episode_index, runs in enumerate(episodes):
                for run_number, value in enumerate(runs, start=1):
                    records.append(
                        {
                            "__chat_episode_index": episode_index,
                            "coder": f"{model}__run{run_number}",
                            "cooperation": value,
                            "score": value * 2,
                            "note": "ignored text",
                        }
                    )

        report = build_inter_coder_agreement(
            pd.DataFrame(records),
            codebook=self.codebook,
            participants=[],
        )

        self.assertTrue(report["eligible"])
        self.assertEqual(report["model_count"], 2)
        self.assertEqual(report["numeric_variables"], ["cooperation", "score"])
        self.assertEqual(len(report["pairs"]), 1)
        pair = report["pairs"][0]
        cooperation = next(row for row in pair["variables"] if row["variable"] == "cooperation")
        self.assertEqual(cooperation["n"], 3)
        self.assertAlmostEqual(cooperation["agreement_rate"], 100 / 3)
        self.assertAlmostEqual(cooperation["cohens_kappa"], -0.5)
        self.assertNotIn("note", {row["variable"] for row in pair["variables"]})

        frame = agreement_report_frame(report)
        self.assertEqual(set(frame["variable"]), {"cooperation", "score"})
        self.assertEqual(len(frame), 2)

    def test_multiple_runs_of_one_model_do_not_trigger_inter_coder_analysis(self):
        detail = pd.DataFrame(
            [
                {"__chat_episode_index": 0, "coder": "openai/model__run1", "cooperation": 1},
                {"__chat_episode_index": 0, "coder": "openai/model__run2", "cooperation": 0},
            ]
        )

        report = build_inter_coder_agreement(
            detail,
            codebook=[self.codebook[0]],
            participants=[],
        )

        self.assertFalse(report["eligible"])
        self.assertEqual(report["model_count"], 1)
        self.assertEqual(report["pairs"], [])

    def test_three_models_produce_all_three_pairwise_tables(self):
        detail = pd.DataFrame(
            [
                {"__chat_episode_index": 0, "coder": "openai/model", "cooperation": 1},
                {"__chat_episode_index": 0, "coder": "gemini/model", "cooperation": 1},
                {"__chat_episode_index": 0, "coder": "deepseek/model", "cooperation": 0},
            ]
        )

        report = build_inter_coder_agreement(
            detail,
            codebook=[self.codebook[0]],
            participants=[],
        )

        self.assertEqual(len(report["pairs"]), 3)
        self.assertEqual(
            {(pair["model_a"], pair["model_b"]) for pair in report["pairs"]},
            {
                ("openai/model", "gemini/model"),
                ("openai/model", "deepseek/model"),
                ("gemini/model", "deepseek/model"),
            },
        )

    def test_text_only_codebook_has_no_numeric_agreement_rows(self):
        detail = pd.DataFrame(
            [
                {"__chat_episode_index": 0, "coder": "openai/model", "note": "one"},
                {"__chat_episode_index": 0, "coder": "gemini/model", "note": "two"},
            ]
        )

        report = build_inter_coder_agreement(
            detail,
            codebook=[self.codebook[2]],
            participants=[],
        )

        self.assertTrue(report["eligible"])
        self.assertEqual(report["numeric_variables"], [])
        self.assertEqual(report["pairs"][0]["variables"], [])

    def test_failed_calls_are_excluded_before_model_aggregation(self):
        detail = pd.DataFrame(
            [
                {"__chat_episode_index": 0, "coder": "openai/model", "cooperation": None, "_error": "api_failed"},
                {"__chat_episode_index": 0, "coder": "gemini/model", "cooperation": 1},
            ]
        )

        report = build_inter_coder_agreement(
            detail,
            codebook=[self.codebook[0]],
            participants=[],
        )

        metric = report["pairs"][0]["variables"][0]
        self.assertEqual(metric["n"], 0)
        self.assertIsNone(metric["agreement_rate"])
        self.assertIsNone(metric["cohens_kappa"])


if __name__ == "__main__":
    unittest.main()
