"""Runs LLM-based coding row by row with multi-model voting support."""

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
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai/",
    "deepseek": "https://api.deepseek.com",
    "mistral": "https://api.mistral.ai/v1",
    "together": "https://api.together.xyz/v1",
}


def _get_provider_instance(provider_name: str, model_id: str, api_key: str) -> LLMProvider:
    """Get an LLM provider instance for the given provider and model."""
    if provider_name not in PROVIDER_BASE_URLS:
        raise ValueError(f"Unknown provider: {provider_name}")

    if provider_name == "anthropic":
        from app.services.providers.anthropic_provider import AnthropicProvider
        return AnthropicProvider(api_key=api_key, model=model_id)

    if provider_name == "gemini":
        from app.services.providers.gemini_provider import GeminiProvider
        return GeminiProvider(api_key=api_key, model=model_id)

    # OpenAI-compatible: openai, deepseek, mistral, together
    base_url = PROVIDER_BASE_URLS.get(provider_name)
    from app.services.providers.openai_provider import OpenAICompatibleProvider
    return OpenAICompatibleProvider(api_key=api_key, model=model_id, base_url=base_url)


def _expanded_keys(codebook: list[dict[str, Any]], participants: list[str] | None) -> list[str]:
    """Output keys: window variables stay as-is; sender variables expand to "Var [P]"."""
    participants = participants or []
    keys: list[str] = []
    for var in codebook:
        if var.get("level") == "sender" and participants:
            for p in participants:
                keys.append(f"{var['label']}_{p}")
        else:
            keys.append(var["label"])
    return keys


def _codebook_block(codebook: list[dict[str, Any]], participants: list[str]) -> str:
    """Render the codebook: each variable with its definition + optional examples/context,
    and a definition for every coded value."""
    out = ""
    for var in codebook:
        header = f"### {var['label']} (type: {var.get('type', 'text')}"
        if var.get("level") == "sender" and participants:
            header += f"; coded separately per participant: {', '.join(participants)}"
        header += ")"
        out += header + "\n"
        if (var.get("definition") or "").strip():
            out += f"Definition: {var['definition'].strip()}\n"
        if (var.get("examples") or "").strip():
            out += f"Examples: {var['examples'].strip()}\n"
        if (var.get("context") or "").strip():
            out += f"Notes: {var['context'].strip()}\n"
        values = var.get("values") or []
        printable = [v for v in values if str(v.get("value", "")).strip()]
        if printable:
            out += "Coded values:\n"
            for v in printable:
                line = f"  - {v['value']}"
                if (v.get("definition") or "").strip():
                    line += f": {v['definition'].strip()}"
                if (v.get("examples") or "").strip():
                    line += f" (e.g., {v['examples'].strip()})"
                if (v.get("context") or "").strip():
                    line += f" — {v['context'].strip()}"
                out += line + "\n"
        out += "\n"
    return out


def _build_prompt(
    message_text: str,
    experiment_instructions: str,
    coding_instructions: str,
    codebook: list[dict[str, Any]],
    participants: list[str] | None = None,
    context_block: str = "",
) -> str:
    """Construct the full coding prompt for one row."""
    participants = participants or []
    context_section = f"\n## Context\n{context_block}" if context_block.strip() else ""
    codebook_block = _codebook_block(codebook, participants)

    keys = _expanded_keys(codebook, participants)
    sender_note = ""
    if any(var.get("level") == "sender" for var in codebook) and participants:
        sender_note = (
            "\n- For per-sender variables, output one value per participant using keys of the form "
            f'"Variable_Participant" (e.g. {keys[-1] if keys else "var_P"}; participants: {", ".join(participants)}). '
            "Each participant's messages are tagged with [participant] in the text above."
        )

    coding_section = f"\n## Coding Instructions\n{coding_instructions}\n" if coding_instructions.strip() else ""

    return f"""You are coding one row of data. One row = one episode of observation.

## Experiment Instructions
{experiment_instructions}
{coding_section}
## Codebook
{codebook_block}{context_section}
## Message to Code
{message_text}

## Output Requirements
- Return ONLY valid JSON
- Keys must exactly match: {keys}
- Each value must conform to the type and allowed values specified above{sender_note}
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
    all_coded: list[dict[str, Any]],
    labels: list[str],
    aggregation: str,
) -> dict[str, Any]:
    """Aggregate multiple coding results for one row using mode or mean."""
    result = {}

    for label in labels:
        values = [e.get(label) for e in all_coded if e.get(label) is not None and "_error" not in e]

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


async def run_coding(
    *,
    df: pd.DataFrame,
    message_column: str,
    experiment_instructions: str,
    coding_instructions: str,
    codebook: list[dict[str, Any]],
    participants: list[str] | None = None,
    context: list[dict[str, str]] | None = None,
    model_slots: list[dict[str, str]] | None = None,
    runs_per_model: int = 1,
    aggregation: str = "mode",
    # Legacy single-model params (used if model_slots not provided)
    provider_name: str = "",
    empty_message_handling: str = "ignore", 
    model_id: str = "",
    api_key: str = "",
    max_retries: int = 3,
) -> AsyncGenerator[dict[str, Any], None]:
    """
    Code each row and yield progress messages.

    Supports multiple models × runs_per_model with voting aggregation.
    """
    # Build provider instances
    if model_slots and len(model_slots) > 0:
        providers = []
        # for slot in model_slots:
        #     p = _get_provider_instance(slot["provider"], slot["model"], slot["api_key"])
        #     # providers.append({"instance": p, "label": f"{slot['provider']}/{slot['model']}"})
        #     providers.append({
        #         "instance": p,
        #         "label": f"{slot['provider']}/{slot['model']}",
        #         "params": {
        #             "temperature":  slot.get("temperature"),
        #             "top_p":        slot.get("top_p"),
        #             "max_tokens":   slot.get("max_tokens") or slot.get("max_completion_tokens"),
        #             # Gemini sends these nested — flatten them out here
        #             **(slot.get("generation_config") or {}),
        #         },
        #     })
        for slot in model_slots:
            p = _get_provider_instance(slot["provider"], slot["model"], slot["api_key"])
            
            gen_cfg = slot.get("generation_config") or {}
            params = {
                "temperature": slot.get("temperature") or gen_cfg.get("temperature"),
                "top_p":       slot.get("top_p") or gen_cfg.get("topP"),
                "max_tokens":  slot.get("max_tokens") or slot.get("max_completion_tokens") or gen_cfg.get("maxOutputTokens"),
            }
            # Strip Nones so defaults in complete() kick in for unset params
            params = {k: v for k, v in params.items() if v is not None}

            providers.append({
                "instance": p,
                "label": f"{slot['provider']}/{slot['model']}",
                "params": params,
            })
    else:
        providers = [{"instance": _get_provider_instance(provider_name, model_id, api_key), "label": f"{provider_name}/{model_id}"}]

    labels = _expanded_keys(codebook, participants)
    null_result = {label: None for label in labels}
    total = len(df)
    total_calls = len(providers) * runs_per_model
    use_voting = total_calls > 1
    coded_count = 0
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
            if empty_message_handling == "ignore":
                yield {"type": "progress", "current": row_idx + 1, "total": total, "percent": percent}
                continue
            elif empty_message_handling == "code":
                pass
            else:
                coded = {**null_result, "_error": "empty_message"}
                all_results.append({**original, **coded})
                yield {"type": "progress", "current": row_idx + 1, "total": total, "percent": percent}
                yield {"type": "row", "index": row_idx, "original": original, "coded": coded}
                continue

        # Build context block from this unit's context columns
        context_block = ""
        for spec in (context or []):
            col = spec.get("column")
            if not col or col not in original:
                continue
            val = original.get(col)
            if val is None or str(val).strip() == "":
                continue
            desc = (spec.get("description") or "").strip()
            context_block += f"- {col}: {val}" + (f"  ({desc})" if desc else "") + "\n"

        # Collect results from all models × runs
        prompt = _build_prompt(message, experiment_instructions, coding_instructions, codebook, participants, context_block)
        call_results: list[dict[str, Any]] = []

        for p_info in providers:
            provider_inst = p_info["instance"]
            for run_num in range(1, runs_per_model + 1):
                coder_label = f"{p_info['label']}__run{run_num}" if runs_per_model > 1 else p_info["label"]
                parsed = None
                slot_params = p_info.get("params", {})
                for attempt in range(1, max_retries + 1):
                    try:
                        result = await provider_inst.complete(
                            prompt,
                            system_prompt="You are a precise data coder. Return only valid JSON.",
                            params={
                                "temperature": slot_params.get("temperature", 0.1),
                                "top_p":       slot_params.get("top_p", 1.0),
                                "max_tokens":  slot_params.get("max_tokens", 2048),
                            },
                        )
                        parsed = _parse_llm_json(result["response"])
                        if parsed:
                            break
                        if attempt == max_retries:
                            yield {"type": "error", "index": row_idx,
                                   "message": f"Row {row_idx + 1} [{coder_label}]: JSON parse failed after {max_retries} retries"}
                    except Exception as e:
                        if attempt == max_retries:
                            yield {"type": "error", "index": row_idx,
                                   "message": f"Row {row_idx + 1} [{coder_label}]: {e}"}

                if parsed:
                    call_results.append(parsed)
                    all_results.append({**original, "coder": coder_label, **parsed})
                else:
                    all_results.append({**original, "coder": coder_label, **null_result, "_error": "api_failed"})

        # Aggregate for the streamed row (what the UI shows)
        if call_results:
            if use_voting:
                coded = _aggregate_results(call_results, labels, aggregation)
                coded["_votes"] = len(call_results)
                coded["_total_calls"] = total_calls
            else:
                coded = call_results[0]
            coded_count += 1

            # Add aggregated row to output
            if use_voting:
                all_results.append({**original, "coder": f"__aggregated ({aggregation})", **{k: v for k, v in coded.items() if not k.startswith("_")}})
        else:
            coded = {**null_result, "_error": "all_calls_failed"}

        yield {"type": "progress", "current": row_idx + 1, "total": total, "percent": percent}
        yield {"type": "row", "index": row_idx, "original": original, "coded": coded}

    # Save results
    result_df = pd.DataFrame(all_results)
    # Reorder columns: original cols, coder, codebook labels, then any extra
    orig_cols = list(df.columns)
    ordered_cols = orig_cols + ["coder"] + labels
    extra_cols = [c for c in result_df.columns if c not in ordered_cols]
    result_df = result_df[[c for c in ordered_cols + extra_cols if c in result_df.columns]]

    import tempfile, os
    output_dir = tempfile.mkdtemp(prefix="llm_coding_")
    output_path = os.path.join(output_dir, "coded_results.csv")
    result_df.to_csv(output_path, index=False)

    yield {
        "type": "complete",
        "total_rows": total,
        "coded_rows": coded_count,
        "file_path": output_path,
    }
