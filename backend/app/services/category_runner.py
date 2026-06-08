"""Runs LLM-based category generation and streams results one by one."""

import json
from typing import Any, AsyncGenerator

from app.services.encoding_runner import _get_provider_instance


def _build_category_prompt(
    goals: str,
    hypothesis: str,
    output_type: str,
    target_count: int | None,
    domain: str,
    references: str,
    data_sample: list[dict] | None,
) -> str:

    if output_type == "rate":
        schema = """Each must include:
- label (string): the dimension being rated
- definition (string): what this dimension measures
- scale_min (int): lowest point on the scale, usually 1
- scale_max (int): highest point on the scale, usually 5
- anchor_low (string): what a low score looks like
- anchor_high (string): what a high score looks like
- example (string): a sample text and what score it would receive"""

    elif output_type == "tag":
        schema = """Each must include:
- label (string): the tag name
- definition (string): what this tag captures
- include (string): signals that indicate this tag applies
- exclude (string): signals that indicate this tag does not apply
- example (string): a sample text that would receive this tag
Note: multiple tags can apply to the same unit."""

    elif output_type == "extract":
        schema = """Each must include:
- label (string): the field name to extract
- definition (string): what information to extract for this field
- format (string): expected format of the extracted value (e.g. date, number, name, short phrase)
- include (string): what counts as a valid extraction
- exclude (string): what should be ignored or left blank
- example (string): a sample text and what would be extracted"""

    else:  # classify (default)
        schema = """Each must include:
- label (string)
- definition (string)
- include (string): signals that indicate this category
- exclude (string): signals that rule out this category
- example (string): a sample text that fits this category
Note: categories should be mutually exclusive."""

    return f"""You are an expert in qualitative behavioral coding.

Goals: {goals}
Hypothesis: {hypothesis}
Output type: {output_type}
Target number of categories: {target_count}
Domain: {domain}
References: {references if references else ''}
Sample episodes: {json.dumps(data_sample) if data_sample else '[]'}

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
    data_sample: list[dict] | None,
) -> AsyncGenerator[dict[str, Any], None]:
    provider_inst = _get_provider_instance(provider, model, api_key)

    prompt = _build_category_prompt(
        goals=goals,
        hypothesis=hypothesis,
        output_type=output_type,
        target_count=target_count,
        domain=domain,
        references=references,
        data_sample=data_sample,
    )

    try:
        result = await provider_inst.complete(
            prompt,
            system_prompt="You are an expert in qualitative behavioral coding. Generate structured categories with labels, definitions, inclusion/exclusion criteria, and example phrases.",
            params={"temperature": 0.3, "max_tokens": 4096},
        )
    except Exception as e:
        yield {"type": "error", "message": str(e)}
        return

    categories = _parse_categories(result["response"])

    if categories is None:
        yield {"type": "error", "message": "Failed to parse categories from LLM response."}
        return

    total = len(categories)

    for idx, cat in enumerate(categories):
        yield {
            "type": "category",
            "index": idx,
            "data": cat,
            "total": total,
        }

    yield {"type": "complete", "total": total}