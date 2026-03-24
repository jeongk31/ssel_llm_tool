"""Runs LLM-based encoding row by row, yielding progress updates."""

import json
import time
from typing import Any, AsyncGenerator

import pandas as pd

from app.services.providers import get_provider
from app.services.providers.base import LLMProvider


# Provider → (model_id_in_registry, fallback_model_name, base_url)
PROVIDER_MODEL_MAP = {
    "openai": ("gpt-4o", "gpt-4o", None),
    "anthropic": (None, "claude-sonnet-4-20250514", None),
    "gemini": (None, "gemini-2.0-flash", None),
    "deepseek": ("deepseek-r1", "deepseek-reasoner", "https://api.deepseek.com"),
    "mistral": ("mistral-large", "mistral-large-latest", "https://api.mistral.ai/v1"),
    "together": ("llama-4-maverick", "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8", "https://api.together.xyz/v1"),
}


def _get_provider_instance(provider_name: str, api_key: str) -> LLMProvider:
    """Get an LLM provider instance for the given provider name."""
    info = PROVIDER_MODEL_MAP.get(provider_name)
    if not info:
        raise ValueError(f"Unknown provider: {provider_name}")

    registry_id, _, _ = info

    # Try the registry first
    if registry_id:
        try:
            return get_provider(registry_id, api_key)
        except ValueError:
            pass

    # Fall back to OpenAI-compatible for most providers
    from app.services.providers.openai_provider import OpenAICompatibleProvider
    _, model_name, base_url = info
    return OpenAICompatibleProvider(api_key=api_key, model=model_name, base_url=base_url)


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

    # Strip markdown code fences
    if text.startswith("```"):
        text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

    return None


async def run_encoding(
    *,
    df: pd.DataFrame,
    message_column: str,
    experiment_instructions: str,
    encoding_instructions: str,
    codebook: list[dict[str, Any]],
    provider_name: str,
    api_key: str,
    max_retries: int = 3,
) -> AsyncGenerator[dict[str, Any], None]:
    """
    Encode each row and yield progress messages:
      {"type": "progress", "current": int, "total": int, "percent": float}
      {"type": "row", "index": int, "original": dict, "encoded": dict}
      {"type": "error", "index": int, "message": str}
      {"type": "complete", "total_rows": int, "encoded_rows": int, "file_name": str}
    """
    provider = _get_provider_instance(provider_name, api_key)
    labels = [v["label"] for v in codebook]
    null_result = {label: None for label in labels}
    total = len(df)
    encoded_count = 0
    all_results = []

    for row_idx in range(total):
        row = df.iloc[row_idx]
        message = str(row[message_column]) if pd.notna(row[message_column]) else ""
        original = {col: (None if pd.isna(row[col]) else row[col]) for col in df.columns}

        # Convert numpy types to native Python for JSON serialization
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

        # Call LLM with retries
        encoded = None
        for attempt in range(1, max_retries + 1):
            try:
                prompt = _build_prompt(message, experiment_instructions, encoding_instructions, codebook)
                result = await provider.complete(
                    prompt,
                    system_prompt="You are a precise data encoder. Return only valid JSON.",
                    params={"temperature": 0.1, "max_tokens": 2048},
                )
                parsed = _parse_llm_json(result["response"])
                if parsed:
                    encoded = parsed
                    break
                if attempt == max_retries:
                    encoded = {**null_result, "_error": "json_parse_failed"}
                    yield {"type": "error", "index": row_idx, "message": f"Row {row_idx + 1}: Failed to parse JSON after {max_retries} attempts"}
            except Exception as e:
                if attempt == max_retries:
                    encoded = {**null_result, "_error": str(e)}
                    yield {"type": "error", "index": row_idx, "message": f"Row {row_idx + 1}: {e}"}

        if encoded is None:
            encoded = {**null_result, "_error": "unknown_error"}

        encoded_count += 1
        all_results.append({**original, **encoded})

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
