"""Pairwise agreement for model-level aggregates produced by CAT."""

from __future__ import annotations

from collections import Counter
from itertools import combinations
from typing import Any

import pandas as pd

from app.services.coding_runner import (
    DETAIL_EPISODE_INDEX_COLUMN,
    aggregate_output_labels,
    aggregate_results,
    expanded_codebook_specs,
)


def model_name(coder: str) -> str:
    """Collapse a call-level coder label to its provider/model identifier."""
    return coder.rsplit("__run", 1)[0] if "__run" in coder else coder


def _is_missing(value: Any) -> bool:
    if value is None:
        return True
    try:
        return bool(pd.isna(value))
    except (TypeError, ValueError):
        return False


def _call_records(
    episode_rows: pd.DataFrame,
    raw_labels: list[str],
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for _, row in episode_rows.iterrows():
        record = {
            label: row[label]
            for label in raw_labels
            if label in episode_rows.columns and not _is_missing(row[label])
        }
        error = row.get("_error")
        if not _is_missing(error) and str(error).strip():
            record["_error"] = str(error)
        records.append(record)
    return records


def aggregate_by_model(
    detail_df: pd.DataFrame,
    *,
    codebook: list[dict[str, Any]],
    participants: list[str],
) -> dict[str, pd.DataFrame]:
    """Aggregate every model's runs to one numeric row per coding episode."""
    required = {DETAIL_EPISODE_INDEX_COLUMN, "coder"}
    if not required.issubset(detail_df.columns):
        raise ValueError("Detailed results do not contain model and episode identifiers.")

    raw_labels = [spec["key"] for spec in expanded_codebook_specs(codebook, participants)]
    numeric_labels = aggregate_output_labels(codebook, participants)
    raw = detail_df[detail_df["coder"].notna()].copy()
    raw["coder"] = raw["coder"].astype(str)
    raw = raw[(raw["coder"].str.strip() != "") & ~raw["coder"].str.startswith("__")]
    raw["__cat_model"] = raw["coder"].map(model_name)

    aggregates: dict[str, pd.DataFrame] = {}
    for current_model, model_rows in raw.groupby("__cat_model", sort=False):
        records: list[dict[str, Any]] = []
        for episode_index, episode_rows in model_rows.groupby(
            DETAIL_EPISODE_INDEX_COLUMN, sort=False, dropna=False
        ):
            coded = aggregate_results(
                _call_records(episode_rows, raw_labels),
                codebook,
                participants,
            )
            records.append({DETAIL_EPISODE_INDEX_COLUMN: episode_index, **coded})
        frame = pd.DataFrame(
            records,
            columns=[DETAIL_EPISODE_INDEX_COLUMN, *numeric_labels],
        )
        if not frame.empty:
            frame = frame.set_index(DETAIL_EPISODE_INDEX_COLUMN)
        else:
            frame = pd.DataFrame(columns=numeric_labels)
            frame.index.name = DETAIL_EPISODE_INDEX_COLUMN
        aggregates[str(current_model)] = frame
    return aggregates


def agreement_and_kappa(
    first: pd.Series,
    second: pd.Series,
) -> tuple[float | None, float | None, int]:
    """Return exact agreement percentage, unweighted Cohen's kappa, and paired N.

    Missing observations are removed pairwise. Kappa is undefined when the two
    model marginals imply perfect expected agreement (for example, when both
    models assign the same constant value to every paired episode).
    """
    paired = pd.concat([first.rename("first"), second.rename("second")], axis=1).dropna()
    n = len(paired)
    if n == 0:
        return None, None, 0

    first_values = paired["first"].tolist()
    second_values = paired["second"].tolist()
    observed = sum(a == b for a, b in zip(first_values, second_values)) / n
    first_counts = Counter(first_values)
    second_counts = Counter(second_values)
    categories = set(first_counts) | set(second_counts)
    expected = sum(
        (first_counts[value] / n) * (second_counts[value] / n)
        for value in categories
    )
    denominator = 1 - expected
    kappa = None if abs(denominator) < 1e-12 else (observed - expected) / denominator
    return observed * 100, kappa, n


def build_inter_coder_agreement(
    detail_df: pd.DataFrame,
    *,
    codebook: list[dict[str, Any]],
    participants: list[str],
) -> dict[str, Any]:
    """Compare model aggregates pairwise on every non-text numeric output column."""
    aggregates = aggregate_by_model(
        detail_df,
        codebook=codebook,
        participants=participants,
    )
    models = list(aggregates)
    variables = aggregate_output_labels(codebook, participants)
    pairs: list[dict[str, Any]] = []

    if len(models) >= 2:
        for first_model, second_model in combinations(models, 2):
            variable_rows: list[dict[str, Any]] = []
            for variable in variables:
                agreement, kappa, paired_n = agreement_and_kappa(
                    aggregates[first_model][variable],
                    aggregates[second_model][variable],
                )
                variable_rows.append(
                    {
                        "variable": variable,
                        "agreement_rate": agreement,
                        "cohens_kappa": kappa,
                        "n": paired_n,
                    }
                )
            pairs.append(
                {
                    "model_a": first_model,
                    "model_b": second_model,
                    "variables": variable_rows,
                }
            )

    return {
        "eligible": len(models) >= 2,
        "model_count": len(models),
        "models": models,
        "numeric_variables": variables,
        "pairs": pairs,
    }


def agreement_report_frame(report: dict[str, Any]) -> pd.DataFrame:
    """Flatten an agreement report for CSV export."""
    columns = [
        "model_a",
        "model_b",
        "variable",
        "agreement_rate",
        "cohens_kappa",
        "paired_n",
    ]
    records: list[dict[str, Any]] = []
    for pair in report.get("pairs", []):
        for row in pair.get("variables", []):
            records.append(
                {
                    "model_a": pair["model_a"],
                    "model_b": pair["model_b"],
                    "variable": row["variable"],
                    "agreement_rate": row["agreement_rate"],
                    "cohens_kappa": row["cohens_kappa"],
                    "paired_n": row["n"],
                }
            )
    return pd.DataFrame(records, columns=columns)
