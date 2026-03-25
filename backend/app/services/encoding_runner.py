"""Runs LLM-based encoding row by row with multi-model voting support."""

import json
from collections import Counter
from statistics import mean as stat_mean
from typing import Any, AsyncGenerator

import pandas as pd

from app.services.providers.base import LLMProvider


# Provider → base_url (None = default for the SDK)
PROVIDER_BASE_URLS = {
    "openai": None,
    "anthropic": None,
    "gemini": None,
    "deepseek": "https://api.deepseek.com",
    "mistral": "https://api.mistral.ai/v1",
    "together": "https://api.together.xyz/v1",
}


def _get_provider_instance(provider_name: str, model_id: str, api_key: str) -> LLMProvider:
    """Get an LLM provider instance for the given provider and model."""
    if provider_name not in PROVIDER_BASE_URLS:
        raise ValueError(f"Unknown provider: {provider_name}")
    base_url = PROVIDER_BASE_URLS.get(provider_name)

    from app.services.providers.openai_provider import OpenAICompatibleProvider
    return OpenAICompatibleProvider(api_key=api_key, model=model_id, base_url=base_url)


def _build_prompt(
    message_text: str,
    experiment_instructions: str,
    encoding_instructions: str,
    codebook: list[dict[str, Any]],
) -> str:
    """Construct the full encoding prompt for one row."""
    codebook_block = ""
    for var in codebook:
        codebook_block += (
            f"- {var['label']} (type: {var['type']}): "
            f"{var['definition']}. "
            f"Allowed values: {var.get('encoded_values', 'any')}\n"
        )

    labels = [v["label"] for v in codebook]

    return f"""You are encoding one row of data. One row = one unit of observation.

## Experiment Instructions
{experiment_instructions}

## Encoding Instructions
{encoding_instructions}

## Codebook Variables
{codebook_block}
## Message to Encode
{message_text}

## Output Requirements
- Return ONLY valid JSON
- Keys must exactly match the codebook labels: {labels}
- Each value must conform to the type and allowed values specified above
- Do not include any commentary, explanation, or markdown formatting
"""


def _parse_llm_json(text: str) -> dict | None:
    """Try to parse JSON from LLM response, handling markdown fences."""
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    if text.startswith("```"):
        text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

    return None


def _aggregate_results(
    all_encoded: list[dict[str, Any]],
    labels: list[str],
    aggregation: str,
) -> dict[str, Any]:
    """Aggregate multiple encoding results for one row using mode or mean."""
    result = {}

    for label in labels:
        values = [e.get(label) for e in all_encoded if e.get(label) is not None and "_error" not in e]

        if not values:
            result[label] = None
            continue

        if aggregation == "mean":
            # Try numeric mean
            try:
                nums = [float(v) for v in values]
                result[label] = round(stat_mean(nums), 4)
            except (ValueError, TypeError):
                # Fall back to mode for non-numeric
                counter = Counter(str(v) for v in values)
                winner, count = counter.most_common(1)[0]
                result[label] = winner
        else:
            # Mode (majority vote)
            counter = Counter(str(v) for v in values)
            most_common = counter.most_common()
            winner, count = most_common[0]

            # Check for ties
            if len(most_common) > 1 and most_common[0][1] == most_common[1][1]:
                result[label] = winner  # Take first in tie
                result[f"_{label}_tie"] = True
            else:
                result[label] = winner

    return result


async def run_encoding(
    *,
    df: pd.DataFrame,
    message_column: str,
    experiment_instructions: str,
    encoding_instructions: str,
    codebook: list[dict[str, Any]],
    model_slots: list[dict[str, str]] | None = None,
    runs_per_model: int = 1,
    aggregation: str = "mode",
    # Legacy single-model params (used if model_slots not provided)
    provider_name: str = "",
    model_id: str = "",
    api_key: str = "",
    max_retries: int = 3,
) -> AsyncGenerator[dict[str, Any], None]:
    """
    Encode each row and yield progress messages.

    Supports multiple models × runs_per_model with voting aggregation.
    """
    # Build provider instances
    if model_slots and len(model_slots) > 0:
        providers = []
        for slot in model_slots:
            p = _get_provider_instance(slot["provider"], slot["model"], slot["api_key"])
            providers.append({"instance": p, "label": f"{slot['provider']}/{slot['model']}"})
    else:
        providers = [{"instance": _get_provider_instance(provider_name, model_id, api_key), "label": f"{provider_name}/{model_id}"}]

    labels = [v["label"] for v in codebook]
    null_result = {label: None for label in labels}
    total = len(df)
    total_calls = len(providers) * runs_per_model
    use_voting = total_calls > 1
    encoded_count = 0
    all_results = []

    for row_idx in range(total):
        row = df.iloc[row_idx]
        message = str(row[message_column]) if pd.notna(row[message_column]) else ""
        original = {col: (None if pd.isna(row[col]) else row[col]) for col in df.columns}

        # Convert numpy types
        for k, v in original.items():
            if hasattr(v, 'item'):
                original[k] = v.item()

        percent = round(((row_idx + 1) / total) * 100, 1)

        if not message.strip():
            encoded = {**null_result, "_error": "empty_message"}
            yield {"type": "progress", "current": row_idx + 1, "total": total, "percent": percent}
            yield {"type": "row", "index": row_idx, "original": original, "encoded": encoded}
            all_results.append({**original, **encoded})
            continue

        # Collect results from all models × runs
        prompt = _build_prompt(message, experiment_instructions, encoding_instructions, codebook)
        call_results: list[dict[str, Any]] = []
        call_details: list[dict[str, Any]] = []

        for p_info in providers:
            provider_inst = p_info["instance"]
            for run_num in range(1, runs_per_model + 1):
                parsed = None
                for attempt in range(1, max_retries + 1):
                    try:
                        result = await provider_inst.complete(
                            prompt,
                            system_prompt="You are a precise data encoder. Return only valid JSON.",
                            params={"temperature": 0.1, "max_tokens": 2048},
                        )
                        parsed = _parse_llm_json(result["response"])
                        if parsed:
                            break
                        if attempt == max_retries:
                            yield {"type": "error", "index": row_idx,
                                   "message": f"Row {row_idx + 1} [{p_info['label']} run {run_num}]: JSON parse failed after {max_retries} retries"}
                    except Exception as e:
                        if attempt == max_retries:
                            yield {"type": "error", "index": row_idx,
                                   "message": f"Row {row_idx + 1} [{p_info['label']} run {run_num}]: {e}"}

                if parsed:
                    call_results.append(parsed)
                    call_details.append({"model": p_info["label"], "run": run_num, "result": parsed})
                else:
                    call_details.append({"model": p_info["label"], "run": run_num, "result": None, "error": True})

        # Aggregate
        if call_results:
            if use_voting:
                encoded = _aggregate_results(call_results, labels, aggregation)
                encoded["_votes"] = len(call_results)
                encoded["_total_calls"] = total_calls
            else:
                encoded = call_results[0]
            encoded_count += 1
        else:
            encoded = {**null_result, "_error": "all_calls_failed"}

        # Include per-call details for transparency
        if use_voting:
            encoded["_call_details"] = call_details

        all_results.append({**original, **{k: v for k, v in encoded.items() if not k.startswith("_call")}})

        yield {"type": "progress", "current": row_idx + 1, "total": total, "percent": percent}
        yield {"type": "row", "index": row_idx, "original": original, "encoded": encoded}

    # Save results
    result_df = pd.DataFrame(all_results)
    import tempfile, os
    output_dir = tempfile.mkdtemp(prefix="llm_encoding_")
    output_path = os.path.join(output_dir, "encoded_results.csv")
    result_df.to_csv(output_path, index=False)

    yield {
        "type": "complete",
        "total_rows": total,
        "encoded_rows": encoded_count,
        "file_path": output_path,
    }
