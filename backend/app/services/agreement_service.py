"""Inter-rater agreement computation using irrCAC."""

from itertools import combinations
from typing import Any

import numpy as np
import pandas as pd
from irrCAC.raw import CAC


# ── Core metric computation ──────────────────────────────────────────────────

def compute_metrics(rater_df: pd.DataFrame) -> dict[str, Any]:
    """Compute percent agreement, Fleiss'/Cohen's kappa, and Gwet's AC1.

    Args:
        rater_df: DataFrame where columns = raters, rows = items.

    Returns:
        Dict with percent_agreement, cohens_kappa, gwets_ac1 (each has estimate, se, ci_lower, ci_upper).
    """
    rater_df = rater_df.dropna(how="all")
    if len(rater_df) < 2:
        return _empty_metrics("Too few items")

    # Convert to string (irrCAC needs consistent types), keep NaN as float NaN
    clean_df = rater_df.copy()
    for col in clean_df.columns:
        clean_df[col] = clean_df[col].apply(lambda x: str(x) if pd.notna(x) else np.nan)

    # Single category → perfect agreement
    all_vals = clean_df.stack().dropna()
    if len(all_vals.unique()) < 2:
        perfect = {"estimate": 1.0, "se": 0, "ci_lower": 1.0, "ci_upper": 1.0}
        return {"percent_agreement": perfect, "cohens_kappa": perfect, "gwets_ac1": perfect,
                "n_items": len(clean_df), "n_raters": len(clean_df.columns)}

    try:
        cac = CAC(clean_df)
    except Exception as e:
        return _empty_metrics(str(e))

    result = {"n_items": len(clean_df), "n_raters": len(clean_df.columns)}

    try:
        gwet = cac.gwet()
        est = gwet["est"]
        ci = est.get("confidence_interval", (None, None))
        result["gwets_ac1"] = _extract_metric(est, ci)
        result["percent_agreement"] = {"estimate": _safe_float(est.get("pa", 0)), "se": None, "ci_lower": None, "ci_upper": None}
    except Exception:
        result["gwets_ac1"] = _null_metric()
        result["percent_agreement"] = _null_metric()

    try:
        fleiss = cac.fleiss()
        est = fleiss["est"]
        ci = est.get("confidence_interval", (None, None))
        result["cohens_kappa"] = _extract_metric(est, ci)
    except Exception:
        result["cohens_kappa"] = _null_metric()

    return result


# ── Episode-based cross-check and analysis ───────────────────────────────────

def load_rater_file(file_path: str) -> pd.DataFrame:
    """Load a CSV or Excel file into a DataFrame."""
    ext = file_path.rsplit(".", 1)[-1].lower()
    if ext == "csv":
        return pd.read_csv(file_path)
    return pd.read_excel(file_path)


def cross_check(
    raters: list[dict],
    uploaded_files: dict,
    episode_columns: list[str],
    analysis_variables: list[str],
) -> dict:
    """Validate that all rater files have required columns and compute episode overlap.

    Args:
        raters: List of {file_id, name, rater_type (human|llm)}
        uploaded_files: Server-side file store
        episode_columns: Columns that define a unique episode
        analysis_variables: Columns to analyze

    Returns:
        Dict with: ok, common_episodes count, per_rater info, missing columns, warnings
    """
    required_cols = set(episode_columns + analysis_variables)
    per_rater = []
    episode_sets = []
    warnings = []
    missing_cols = []

    for rater in raters:
        fid = rater["file_id"]
        if fid not in uploaded_files:
            missing_cols.append({"rater": rater["name"], "error": "File not found"})
            continue

        df = load_rater_file(uploaded_files[fid]["path"])
        file_cols = set(df.columns)
        missing = required_cols - file_cols
        if missing:
            missing_cols.append({"rater": rater["name"], "missing": list(missing)})
            continue

        # Build episode keys
        ep_keys = df[episode_columns].apply(lambda r: tuple(r), axis=1)
        ep_set = set(ep_keys)
        episode_sets.append(ep_set)
        per_rater.append({
            "name": rater["name"],
            "rater_type": rater["rater_type"],
            "total_episodes": len(ep_set),
            "file_columns": list(df.columns),
        })

    if missing_cols:
        return {"ok": False, "missing_columns": missing_cols, "common_episodes": 0, "per_rater": per_rater, "warnings": warnings}

    if not episode_sets:
        return {"ok": False, "missing_columns": [], "common_episodes": 0, "per_rater": per_rater, "warnings": ["No files loaded"]}

    common = episode_sets[0]
    for s in episode_sets[1:]:
        common = common & s

    for i, rater in enumerate(raters):
        if i < len(episode_sets):
            diff = len(episode_sets[i]) - len(common)
            if diff > 0:
                warnings.append(f"{rater['name']}: {diff} episodes not in common — will be skipped")

    return {
        "ok": True,
        "common_episodes": len(common),
        "per_rater": per_rater,
        "warnings": warnings,
        "missing_columns": [],
    }


def compute_agreement(
    raters: list[dict],
    uploaded_files: dict,
    episode_columns: list[str],
    analysis_variables: list[str],
) -> dict:
    """Compute pairwise and group agreement metrics.

    Returns:
        Dict with: inter_human, inter_llm, human_vs_llm (each has overall + per_variable + per_pair)
    """
    # Load all rater DataFrames, keyed by episode
    rater_dfs = {}
    for rater in raters:
        fid = rater["file_id"]
        if fid not in uploaded_files:
            continue
        df = load_rater_file(uploaded_files[fid]["path"])
        ep_keys = df[episode_columns].apply(lambda r: tuple(r), axis=1)
        df = df.copy()
        df["__ep_key"] = ep_keys
        rater_dfs[rater["name"]] = {"df": df, "type": rater["rater_type"]}

    if len(rater_dfs) < 2:
        return {"error": "Need at least 2 raters"}

    # Find common episodes
    all_ep_sets = [set(v["df"]["__ep_key"]) for v in rater_dfs.values()]
    common_eps = all_ep_sets[0]
    for s in all_ep_sets[1:]:
        common_eps = common_eps & s
    common_eps_list = sorted(common_eps)

    if not common_eps_list:
        return {"error": "No episodes in common across all raters"}

    # Filter each rater to common episodes and sort by episode key
    for name in rater_dfs:
        df = rater_dfs[name]["df"]
        df = df[df["__ep_key"].isin(common_eps)].copy()
        df = df.sort_values("__ep_key").reset_index(drop=True)
        rater_dfs[name]["df"] = df

    # Split into human and LLM groups
    humans = {n: v for n, v in rater_dfs.items() if v["type"] == "human"}
    llms = {n: v for n, v in rater_dfs.items() if v["type"] == "llm"}

    results = {"n_episodes": len(common_eps_list)}

    # Inter-human
    if len(humans) >= 2:
        results["inter_human"] = _compute_group_agreement(humans, analysis_variables)
    else:
        results["inter_human"] = None

    # Inter-LLM
    if len(llms) >= 2:
        results["inter_llm"] = _compute_group_agreement(llms, analysis_variables)
    else:
        results["inter_llm"] = None

    # Human vs LLM (all cross-group pairs)
    if humans and llms:
        results["human_vs_llm"] = _compute_cross_group_agreement(humans, llms, analysis_variables)
    else:
        results["human_vs_llm"] = None

    return results


def _compute_group_agreement(group: dict, variables: list[str]) -> dict:
    """Compute pairwise agreement within a group of raters."""
    names = list(group.keys())
    pairs = list(combinations(names, 2))

    per_pair = {}
    for a, b in pairs:
        pair_label = f"{a} vs {b}"
        per_var = {}
        for var in variables:
            rater_df = pd.DataFrame({
                a: group[a]["df"][var].values,
                b: group[b]["df"][var].values,
            })
            per_var[var] = compute_metrics(rater_df)
        per_pair[pair_label] = per_var

    # Overall: average metrics across all pairs and variables
    overall = _average_metrics(per_pair, variables)

    return {"overall": overall, "per_pair": per_pair, "pairs": [f"{a} vs {b}" for a, b in pairs]}


def _compute_cross_group_agreement(group_a: dict, group_b: dict, variables: list[str]) -> dict:
    """Compute pairwise agreement between two groups (human vs LLM)."""
    per_pair = {}
    for a_name in group_a:
        for b_name in group_b:
            pair_label = f"{a_name} vs {b_name}"
            per_var = {}
            for var in variables:
                rater_df = pd.DataFrame({
                    a_name: group_a[a_name]["df"][var].values,
                    b_name: group_b[b_name]["df"][var].values,
                })
                per_var[var] = compute_metrics(rater_df)
            per_pair[pair_label] = per_var

    overall = _average_metrics(per_pair, variables)
    pairs = list(per_pair.keys())

    return {"overall": overall, "per_pair": per_pair, "pairs": pairs}


def _average_metrics(per_pair: dict, variables: list[str]) -> dict:
    """Average metrics across all pairs and variables."""
    metric_keys = ["percent_agreement", "cohens_kappa", "gwets_ac1"]
    result = {}
    for mk in metric_keys:
        estimates = []
        for pair_data in per_pair.values():
            for var in variables:
                if var in pair_data:
                    val = pair_data[var].get(mk, {}).get("estimate")
                    if val is not None:
                        estimates.append(val)
        if estimates:
            result[mk] = {"estimate": round(sum(estimates) / len(estimates), 5), "se": None, "ci_lower": None, "ci_upper": None}
        else:
            result[mk] = _null_metric()
    return result


# ── Helpers ──────────────────────────────────────────────────────────────────

def _extract_metric(est: dict, ci: tuple) -> dict:
    return {
        "estimate": _safe_float(est["coefficient_value"]),
        "se": _safe_float(est.get("se")),
        "ci_lower": _safe_float(ci[0]) if ci else None,
        "ci_upper": _safe_float(ci[1]) if ci else None,
    }


def _safe_float(val: Any) -> float | None:
    if val is None:
        return None
    try:
        f = float(val)
        return None if (np.isnan(f) or np.isinf(f)) else round(f, 5)
    except (TypeError, ValueError):
        return None


def _null_metric() -> dict:
    return {"estimate": None, "se": None, "ci_lower": None, "ci_upper": None}


def _empty_metrics(reason: str) -> dict:
    return {
        "percent_agreement": _null_metric(), "cohens_kappa": _null_metric(), "gwets_ac1": _null_metric(),
        "n_items": 0, "n_raters": 0, "error": reason,
    }
