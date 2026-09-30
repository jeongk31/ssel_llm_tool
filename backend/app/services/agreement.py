"""Pairwise agreement for the coders CAT produces.

Two comparisons are reported, and they answer different questions:

- **Within a model** — the repeated runs of one model compared against each other.
  This is a reliability check on the model itself: asked the same thing N times,
  how consistently did it answer? Available whenever a model ran more than once.
- **Between models** — each model's runs are first aggregated to one value per
  episode, then the models are compared. This is agreement between distinct coders.
  Available whenever two or more models were used.

Every comparison reports the exact-match rate, unweighted Cohen's kappa, Gwet's AC1,
and the number of paired episodes. A model with more than two runs has more than one
run pair; those are averaged into a single row per variable (the mean of pairwise
Cohen's kappa is Light's kappa). Nothing is ever averaged across variables.
"""

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


def run_number(coder: str) -> int:
    """The 1-based run this coder label belongs to.

    ``coding_runner`` only appends a ``__runN`` suffix when a model ran more than
    once, so an unsuffixed label is that model's only run.
    """
    if "__run" in coder:
        suffix = coder.rsplit("__run", 1)[1]
        if suffix.isdigit():
            return int(suffix)
    return 1


def run_label(coder: str) -> str:
    """A short display name for one run, e.g. "Run 2"."""
    return f"Run {run_number(coder)}"


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


def _episode_frames(
    detail_df: pd.DataFrame,
    *,
    codebook: list[dict[str, Any]],
    participants: list[str],
    group_by,
) -> dict[str, pd.DataFrame]:
    """One numeric row per episode, for each group of call-level coder rows.

    ``group_by`` decides what a "coder" is: ``model_name`` merges a model's repeated
    runs into one coder, while the identity function keeps every run separate.
    """
    required = {DETAIL_EPISODE_INDEX_COLUMN, "coder"}
    if not required.issubset(detail_df.columns):
        raise ValueError("Detailed results do not contain model and episode identifiers.")

    raw_labels = [spec["key"] for spec in expanded_codebook_specs(codebook, participants)]
    numeric_labels = aggregate_output_labels(codebook, participants)
    raw = detail_df[detail_df["coder"].notna()].copy()
    raw["coder"] = raw["coder"].astype(str)
    raw = raw[(raw["coder"].str.strip() != "") & ~raw["coder"].str.startswith("__")]
    raw["__cat_group"] = raw["coder"].map(group_by)

    aggregates: dict[str, pd.DataFrame] = {}
    for current_model, model_rows in raw.groupby("__cat_group", sort=False):
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


def aggregate_by_model(
    detail_df: pd.DataFrame,
    *,
    codebook: list[dict[str, Any]],
    participants: list[str],
) -> dict[str, pd.DataFrame]:
    """Aggregate every model's runs to one numeric row per coding episode."""
    return _episode_frames(
        detail_df, codebook=codebook, participants=participants, group_by=model_name
    )


def frames_by_run(
    detail_df: pd.DataFrame,
    *,
    codebook: list[dict[str, Any]],
    participants: list[str],
) -> dict[str, pd.DataFrame]:
    """One numeric row per episode for each individual run, runs kept separate."""
    return _episode_frames(
        detail_df, codebook=codebook, participants=participants, group_by=lambda coder: coder
    )


def pair_statistics(first: pd.Series, second: pd.Series) -> dict[str, Any]:
    """Agreement, Cohen's kappa, Gwet's AC1, and paired N for one pair of coders.

    Missing observations are removed pairwise, so N is the number of episodes both
    coders scored. Each distinct value is treated as a nominal category, and the
    category set is the union of the values the two coders actually used.

    The two chance-corrected coefficients disagree by design and it is useful to see
    both. Cohen's kappa subtracts expected agreement built from the product of the
    coders' marginals, which becomes very large when one category dominates — so a
    pair that agrees on 90% of episodes can still score near zero, and kappa is
    undefined outright when both coders use a single constant value. Gwet's AC1
    (Gwet 2008) builds its chance term from the mean marginal per category,

        pe = (1 / (q - 1)) * sum over categories of pi_k * (1 - pi_k)

    which does not collapse under high prevalence and stays defined for a constant
    category, where it reports perfect agreement.
    """
    paired = pd.concat([first.rename("first"), second.rename("second")], axis=1).dropna()
    n = len(paired)
    if n == 0:
        return {"agreement_rate": None, "cohens_kappa": None, "gwets_ac1": None, "n": 0}

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

    if len(categories) < 2:
        # Both coders used one category throughout, so they agreed on everything.
        # Unlike kappa, AC1 is defined here and reports that agreement.
        ac1: float | None = 1.0
    else:
        chance = sum(
            (mean_marginal := (first_counts[value] + second_counts[value]) / (2 * n))
            * (1 - mean_marginal)
            for value in categories
        ) / (len(categories) - 1)
        ac1 = None if abs(1 - chance) < 1e-12 else (observed - chance) / (1 - chance)

    return {
        "agreement_rate": observed * 100,
        "cohens_kappa": kappa,
        "gwets_ac1": ac1,
        "n": n,
    }


def agreement_and_kappa(
    first: pd.Series,
    second: pd.Series,
) -> tuple[float | None, float | None, int]:
    """Exact agreement percentage, unweighted Cohen's kappa, and paired N."""
    stats = pair_statistics(first, second)
    return stats["agreement_rate"], stats["cohens_kappa"], stats["n"]


_STATISTIC_KEYS = ("agreement_rate", "cohens_kappa", "gwets_ac1")


def _variable_rows(
    first: pd.DataFrame,
    second: pd.DataFrame,
    variables: list[str],
) -> list[dict[str, Any]]:
    """Statistics for one coder pair, one row per output variable."""
    return [
        {"variable": variable, **pair_statistics(first[variable], second[variable])}
        for variable in variables
    ]


def _mean_or_none(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


def _averaged_variable_rows(
    pair_rows: list[list[dict[str, Any]]],
    variables: list[str],
) -> list[dict[str, Any]]:
    """Average each statistic over every pair, giving one row per variable.

    The mean of Cohen's kappa taken over all coder pairs is Light's kappa; the means
    of pairwise percent agreement and of pairwise AC1 are reported the same way, so
    a model that ran N times is summarised by one row per variable instead of
    N*(N-1)/2 of them.

    A coefficient that is undefined for a pair is left out of its own mean rather
    than counted as zero, and the mean is undefined only when no pair produced a
    value. N is the mean number of paired episodes, which is simply the common N
    whenever the runs have no missing values.
    """
    by_variable: dict[str, list[dict[str, Any]]] = {variable: [] for variable in variables}
    for rows in pair_rows:
        for row in rows:
            by_variable[row["variable"]].append(row)

    averaged: list[dict[str, Any]] = []
    for variable in variables:
        rows = by_variable[variable]
        entry: dict[str, Any] = {"variable": variable}
        for key in _STATISTIC_KEYS:
            entry[key] = _mean_or_none([row[key] for row in rows if row[key] is not None])
        counts = [row["n"] for row in rows]
        entry["n"] = round(sum(counts) / len(counts)) if counts else 0
        averaged.append(entry)
    return averaged


def build_inter_coder_agreement(
    detail_df: pd.DataFrame,
    *,
    codebook: list[dict[str, Any]],
    participants: list[str],
) -> dict[str, Any]:
    """Agreement within each model's repeated runs and between the models."""
    aggregates = aggregate_by_model(
        detail_df,
        codebook=codebook,
        participants=participants,
    )
    per_run = frames_by_run(
        detail_df,
        codebook=codebook,
        participants=participants,
    )
    models = list(aggregates)
    variables = aggregate_output_labels(codebook, participants)

    # Between models: each model's runs are already aggregated to one value per
    # episode, so this compares the models as coders rather than their raw calls.
    pairs: list[dict[str, Any]] = []
    if len(models) >= 2:
        for first_model, second_model in combinations(models, 2):
            pairs.append(
                {
                    "model_a": first_model,
                    "model_b": second_model,
                    "variables": _variable_rows(
                        aggregates[first_model], aggregates[second_model], variables
                    ),
                }
            )

    # Within each model: its repeated runs compared against one another. Every run
    # pair is listed separately rather than averaged.
    runs_by_model: dict[str, list[str]] = {}
    for coder in per_run:
        runs_by_model.setdefault(model_name(coder), []).append(coder)

    within_models: list[dict[str, Any]] = []
    for model in models:
        model_runs = sorted(runs_by_model.get(model, []), key=run_number)
        if len(model_runs) < 2:
            continue
        run_pairs = list(combinations(model_runs, 2))
        pair_rows = [
            _variable_rows(per_run[first_run], per_run[second_run], variables)
            for first_run, second_run in run_pairs
        ]
        within_models.append(
            {
                "model": model,
                "run_count": len(model_runs),
                "runs": [run_label(coder) for coder in model_runs],
                "pair_count": len(run_pairs),
                "variables": _averaged_variable_rows(pair_rows, variables),
            }
        )

    return {
        # "eligible" and "pairs" keep their original between-models meaning.
        "eligible": len(models) >= 2,
        "model_count": len(models),
        "models": models,
        "numeric_variables": variables,
        "pairs": pairs,
        "within_eligible": bool(within_models),
        "within_models": within_models,
    }


def agreement_report_frame(report: dict[str, Any]) -> pd.DataFrame:
    """Flatten an agreement report for CSV export.

    One row per comparison and variable. ``comparison`` says which question the row
    answers: ``within-model`` summarises the runs of the model named in ``model``,
    averaged over ``run_pairs_averaged`` run pairs, while ``between-models`` compares
    the two named models' aggregated values.
    """
    columns = [
        "comparison",
        "model",
        "coder_a",
        "coder_b",
        "run_pairs_averaged",
        "variable",
        "agreement_rate",
        "cohens_kappa",
        "gwets_ac1",
        "paired_n",
    ]
    records: list[dict[str, Any]] = []
    for model in report.get("within_models", []):
        for row in model.get("variables", []):
            records.append(
                {
                    "comparison": "within-model",
                    "model": model["model"],
                    "coder_a": "",
                    "coder_b": "",
                    "run_pairs_averaged": model["pair_count"],
                    "variable": row["variable"],
                    "agreement_rate": row["agreement_rate"],
                    "cohens_kappa": row["cohens_kappa"],
                    "gwets_ac1": row["gwets_ac1"],
                    "paired_n": row["n"],
                }
            )
    for pair in report.get("pairs", []):
        for row in pair.get("variables", []):
            records.append(
                {
                    "comparison": "between-models",
                    "model": "",
                    "coder_a": pair["model_a"],
                    "coder_b": pair["model_b"],
                    "run_pairs_averaged": "",
                    "variable": row["variable"],
                    "agreement_rate": row["agreement_rate"],
                    "cohens_kappa": row["cohens_kappa"],
                    "gwets_ac1": row["gwets_ac1"],
                    "paired_n": row["n"],
                }
            )
    return pd.DataFrame(records, columns=columns)
