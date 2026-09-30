import unittest

import pandas as pd

from app.services.agreement import (
    agreement_and_kappa,
    agreement_report_frame,
    build_inter_coder_agreement,
    pair_statistics,
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
        # 2 variables between the models, plus one averaged row per model per
        # variable (each model's 3 run pairs collapse into a single row).
        self.assertEqual(len(frame), 2 + 2 * 2)
        self.assertEqual(set(frame[frame["comparison"] == "within-model"]["run_pairs_averaged"]), {3})
        self.assertEqual(
            set(frame["comparison"]), {"between-models", "within-model"}
        )
        between = frame[frame["comparison"] == "between-models"]
        self.assertEqual(len(between), 2)

    def test_one_model_run_twice_is_compared_within_itself_not_between_models(self):
        detail = pd.DataFrame(
            [
                {"__chat_episode_index": 0, "coder": "openai/model__run1", "cooperation": 1},
                {"__chat_episode_index": 0, "coder": "openai/model__run2", "cooperation": 0},
                {"__chat_episode_index": 1, "coder": "openai/model__run1", "cooperation": 1},
                {"__chat_episode_index": 1, "coder": "openai/model__run2", "cooperation": 1},
            ]
        )

        report = build_inter_coder_agreement(
            detail,
            codebook=[self.codebook[0]],
            participants=[],
        )

        # There is only one model, so there is nothing to compare between models.
        self.assertFalse(report["eligible"])
        self.assertEqual(report["model_count"], 1)
        self.assertEqual(report["pairs"], [])

        # The model's two runs are compared against each other.
        self.assertTrue(report["within_eligible"])
        self.assertEqual(len(report["within_models"]), 1)
        within = report["within_models"][0]
        self.assertEqual(within["model"], "openai/model")
        self.assertEqual(within["run_count"], 2)
        self.assertEqual(within["runs"], ["Run 1", "Run 2"])
        self.assertEqual(within["pair_count"], 1)
        self.assertEqual(len(within["variables"]), 1)
        metric = within["variables"][0]
        self.assertEqual(metric["variable"], "cooperation")
        self.assertEqual(metric["n"], 2)
        self.assertEqual(metric["agreement_rate"], 50.0)
        self.assertIn("gwets_ac1", metric)

    def test_a_single_run_has_nothing_to_compare_within_the_model(self):
        detail = pd.DataFrame(
            [
                {"__chat_episode_index": 0, "coder": "openai/model", "cooperation": 1},
                {"__chat_episode_index": 1, "coder": "openai/model", "cooperation": 0},
            ]
        )

        report = build_inter_coder_agreement(
            detail,
            codebook=[self.codebook[0]],
            participants=[],
        )

        self.assertFalse(report["within_eligible"])
        self.assertEqual(report["within_models"], [])
        self.assertFalse(report["eligible"])

    def test_three_runs_are_averaged_into_one_row_per_variable(self):
        records = []
        # Run 1 and Run 2 agree on both episodes; Run 3 disagrees on both, so the
        # three run pairs agree 100%, 0% and 0% -> a mean of 33.3%.
        values = {1: [1, 1], 2: [1, 1], 3: [0, 0]}
        for run_number, episodes in values.items():
            for episode_index, value in enumerate(episodes):
                records.append(
                    {
                        "__chat_episode_index": episode_index,
                        "coder": f"openai/model__run{run_number}",
                        "cooperation": value,
                    }
                )

        report = build_inter_coder_agreement(
            pd.DataFrame(records),
            codebook=[self.codebook[0]],
            participants=[],
        )

        within = report["within_models"][0]
        self.assertEqual(within["run_count"], 3)
        self.assertEqual(within["pair_count"], 3)
        self.assertNotIn("pairs", within)
        self.assertEqual(len(within["variables"]), 1)
        row = within["variables"][0]
        self.assertEqual(row["variable"], "cooperation")
        self.assertAlmostEqual(row["agreement_rate"], 100 / 3)
        # Run 1 vs Run 2 is a constant category, so kappa is undefined there and is
        # left out of the mean instead of being counted as zero.
        self.assertAlmostEqual(row["cohens_kappa"], 0.0)
        # AC1 stays defined for that constant pair and reports 1.0 for it.
        self.assertAlmostEqual(row["gwets_ac1"], (1.0 - 1.0 - 1.0) / 3)
        self.assertEqual(row["n"], 2)

    def test_gwets_ac1_stays_usable_where_cohens_kappa_collapses(self):
        # The documented high-prevalence case: the coders agree on 80% of items but
        # 90% of scores fall in one category, which drives Cohen's kappa negative.
        stats = pair_statistics(
            pd.Series([1, 1, 1, 1, 1, 1, 1, 1, 1, 0]),
            pd.Series([1, 1, 1, 1, 1, 1, 1, 1, 0, 1]),
        )
        self.assertEqual(stats["n"], 10)
        self.assertAlmostEqual(stats["agreement_rate"], 80.0)
        self.assertAlmostEqual(stats["cohens_kappa"], -1 / 9)
        self.assertAlmostEqual(stats["gwets_ac1"], 0.62 / 0.82)

    def test_a_single_constant_category_is_perfect_for_ac1_and_undefined_for_kappa(self):
        stats = pair_statistics(pd.Series([1, 1, 1]), pd.Series([1, 1, 1]))
        self.assertEqual(stats["agreement_rate"], 100.0)
        self.assertIsNone(stats["cohens_kappa"])
        self.assertEqual(stats["gwets_ac1"], 1.0)

    def test_total_disagreement_reports_minus_one_for_both_coefficients(self):
        stats = pair_statistics(pd.Series([1, 1, 0, 0]), pd.Series([0, 0, 1, 1]))
        self.assertEqual(stats["agreement_rate"], 0.0)
        self.assertAlmostEqual(stats["cohens_kappa"], -1.0)
        self.assertAlmostEqual(stats["gwets_ac1"], -1.0)

    def test_no_paired_values_leaves_every_statistic_undefined(self):
        stats = pair_statistics(pd.Series([None, 1]), pd.Series([0, None]))
        self.assertEqual(stats["n"], 0)
        self.assertIsNone(stats["agreement_rate"])
        self.assertIsNone(stats["cohens_kappa"])
        self.assertIsNone(stats["gwets_ac1"])

    def test_both_comparisons_appear_for_several_models_run_several_times(self):
        # Two models, two runs each: one within-model report per model, and one
        # between-models report using each model's aggregated values.
        records = []
        for model in ("openai/model", "gemini/model"):
            for run_number in (1, 2):
                for episode_index in range(2):
                    records.append(
                        {
                            "__chat_episode_index": episode_index,
                            "coder": f"{model}__run{run_number}",
                            "cooperation": 1,
                        }
                    )

        report = build_inter_coder_agreement(
            pd.DataFrame(records),
            codebook=[self.codebook[0]],
            participants=[],
        )

        self.assertEqual([m["model"] for m in report["within_models"]],
                         ["openai/model", "gemini/model"])
        # One averaged table per model, from that model's single run pair.
        self.assertEqual([m["pair_count"] for m in report["within_models"]], [1, 1])
        self.assertEqual([len(m["variables"]) for m in report["within_models"]], [1, 1])
        self.assertEqual(len(report["pairs"]), 1)

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

    def test_sender_level_categorical_values_use_expanded_binary_columns(self):
        detail = pd.DataFrame(
            [
                {"__chat_episode_index": 0, "coder": "openai/model", "choice_P1": "yes"},
                {"__chat_episode_index": 0, "coder": "gemini/model", "choice_P1": "yes"},
                {"__chat_episode_index": 1, "coder": "openai/model", "choice_P1": "no"},
                {"__chat_episode_index": 1, "coder": "gemini/model", "choice_P1": "yes"},
            ]
        )
        codebook = [
            {
                "label": "choice",
                "type": "categorical",
                "level": "sender",
                "aggregation": "mean",
                "values": [{"value": "yes"}, {"value": "no"}],
            }
        ]

        report = build_inter_coder_agreement(
            detail,
            codebook=codebook,
            participants=["P1"],
        )

        self.assertEqual(report["numeric_variables"], ["choice_P1_yes", "choice_P1_no"])
        metrics = {row["variable"]: row for row in report["pairs"][0]["variables"]}
        self.assertEqual(metrics["choice_P1_yes"]["agreement_rate"], 50.0)
        self.assertEqual(metrics["choice_P1_no"]["agreement_rate"], 50.0)
        self.assertEqual(metrics["choice_P1_yes"]["n"], 2)

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
