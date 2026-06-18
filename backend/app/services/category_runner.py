"""Runs LLM-based category generation and streams results one by one."""

import json
from typing import Any, AsyncGenerator

from app.services.coding_runner import _get_provider_instance

import asyncio



def _build_category_prompt(
    goals: str,
    hypothesis: str,
    output_type: str,
    target_count: int | None,
    domain: str,
    references: str,
    data_sample: list[dict] | None,
) -> str:

#     if output_type == "rate":
#         schema = """Each must include:
# - label (string): the dimension being rated
# - definition (string): what this dimension measures
# - scale_min (int): lowest point on the scale, usually 1
# - scale_max (int): highest point on the scale, usually 5
# - anchor_low (string): what a low score looks like
# - anchor_high (string): what a high score looks like
# - example (string): a sample text and what score it would receive"""

#     elif output_type == "tag":
#         schema = """Each must include:
# - label (string): the tag name
# - definition (string): what this tag captures
# - include (string): signals that indicate this tag applies
# - exclude (string): signals that indicate this tag does not apply
# - example (string): a sample text that would receive this tag
# Note: multiple tags can apply to the same unit."""

#     elif output_type == "extract":
#         schema = """Each must include:
# - label (string): the field name to extract
# - definition (string): what information to extract for this field
# - format (string): expected format of the extracted value (e.g. date, number, name, short phrase)
# - include (string): what counts as a valid extraction
# - exclude (string): what should be ignored or left blank
# - example (string): a sample text and what would be extracted"""

#     else:  # classify (default)
#         schema = """Each must include:
# - label (string)
# - definition (string)
# - include (string): signals that indicate this category
# - exclude (string): signals that rule out this category
# - example (string): a sample text that fits this category
# Note: categories should be mutually exclusive."""

        if output_type == "rate":
            schema = """Each must include:
- label (string): the dimension being rated
- definition (string): what this dimension measures
- values (string): the numeric scale used to code this dimension (e.g. 1-5, 1-7, 1-10), or can be an ordinal scale (e.g. weak, moderate, strong)
- anchor_low (string): what a low score looks like
- anchor_high (string): what a high score looks like
- example (string): a sample text and what numeric value it would receive"""

        elif output_type == "tag":
            schema = """Each must include:
- label (string): the tag name
- definition (string): what this tag captures
- values (string): the values used to code this tag (e.g. 0/1, true/false, present/absent)
- example (string): a sample text and what value it would be coded as"""

        elif output_type == "extract":
            schema = """Each must include:
- label (string): the field name to extract
- definition (string): what information to extract for this field
- values (string): the type of value that will be recorded (e.g. free text, numeric, date, named entity,)
- format (string): expected format of the extracted value
- example (string): a sample text and the exact value that would be extracted"""

        else:  # classify
            schema = """Each must include:
- label (string)
- definition (string)
- values (string): the exact values used to code this category (e.g. 0/1, yes/no, or a list of ordinal named labels like positive/neutral/negative)
- example (string): a sample text and what value it would be coded as
Note: categories should be mutually exclusive."""

        values_guide = """
## Coding Value Types
The 'values' field describes how THIS SINGLE CATEGORY will be coded on its own — not the relationship between all categories.

Each category is coded independently. Choose the coding scheme for that individual category:
- Binary: 0/1 or true/false or yes/no (use when this category is either present or absent in a message)
- Ordinal: ordered labels (e.g. low/medium/high, never/sometimes/always)
- Scale: numeric range (e.g. 1-5, 1-7, 1-10, use for rate output type)
- Continuous: any numeric value (e.g. 0.0-1.0, use for probabilities)
- Free text: open-ended string (use for extract output type)

Example for a binary category: "0/1 or true/false or yes/no (Binary)"
Example for a scale category: "1-5 scale (Scale)"
Example for an ordinal category: "never/sometimes/always (Ordinal)"

Do NOT list other category names as values. Each category is coded independently.
"""

        return f"""You are an expert in qualitative behavioral coding.

Goals: {goals}
Hypothesis: {hypothesis}
Output type: {output_type}
Target number of categories: {target_count}
Domain: {domain}
References: {references if references else ''}
Sample episodes: {json.dumps(data_sample) if data_sample else '[]'}
{values_guide}
Generate a JSON array of {target_count} categories suited for a {output_type} coding scheme.
{schema}

Return ONLY a raw JSON array. No markdown. No code fences. No explanation. The response must start with [ and end with ].
"""


def _parse_categories(text: str) -> list[dict] | None:
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

async def run_category_generation(
    *,
    provider: str,
    model: str,
    api_key: str,
    goals: str,
    hypothesis: str,
    output_type: str,
    target_count: int | None,
    domain: str,
    references: str,
    file_id: str | None = None,       
    message_column: str | None = None, 
):
    print(">>> run_category_generation called")
    provider_inst = _get_provider_instance(provider, model, api_key)
    print(f">>> provider instance created: {provider_inst}")

# If a file was uploaded, sample rows from it
    if file_id and message_column:
        from app.routes.coding import _uploaded_files
        import pandas as pd
        import random

        file_info = _uploaded_files.get(file_id)
        if file_info:
            ext = file_info["path"].rsplit(".", 1)[-1].lower()
            df = pd.read_csv(file_info["path"]) if ext == "csv" else pd.read_excel(file_info["path"])

            if message_column in df.columns:
                # Sample up to 15 non-empty rows
                valid = df[df[message_column].notna() & (df[message_column].astype(str).str.strip() != "")]
                sample = valid.sample(min(15, len(valid)), random_state=42)
                data_sample = [
                    {"id": i + 1, "text": str(row[message_column])}
                    for i, (_, row) in enumerate(sample.iterrows())
                ]

    prompt = _build_category_prompt(
        goals=goals,
        hypothesis=hypothesis,
        output_type=output_type,
        target_count=target_count,
        domain=domain,
        references=references,
        data_sample=data_sample,  # now populated from file if uploaded
    )


    try:
        result = await provider_inst.complete(
            prompt,
            system_prompt="You are an expert in qualitative behavioral coding.",
            params={"temperature": 0.3, "max_tokens": 4096},
        )
        print(f">>> LLM response received, length: {len(result['response'])}")
    except Exception as e:
        print(f">>> LLM error: {e}")
        yield {"type": "error", "message": str(e)}
        return

    categories = _parse_categories(result["response"])
    print(f">>> parsed categories: {categories is not None}, count: {len(categories) if categories else 0}")

    if categories is None:
        yield {"type": "error", "message": "Failed to parse categories from LLM response."}
        return

    total = len(categories)

    for idx, cat in enumerate(categories):
        print(f">>> yielding category {idx + 1}/{total}")
        yield {
            "type": "category",
            "index": idx,
            "data": cat,
            "total": total,
        }
        await asyncio.sleep(0.4)
    print(">>> yielding complete")
    yield {"type": "complete", "total": total}

