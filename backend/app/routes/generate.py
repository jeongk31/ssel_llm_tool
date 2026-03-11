from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.providers import get_provider

router = APIRouter()


class GenerateRequest(BaseModel):
    api_key: str
    model: str
    provider: str
    name: str
    hypothesis: str = ""
    goals: str = ""
    data_sample: list[dict] | None = None
    codebook: list[dict] | None = None  # only for prompt generation


@router.post("/generate/codebook")
async def generate_codebook(req: GenerateRequest):
    try:
        provider = get_provider(req.model, req.api_key)
    except ValueError as e:
        raise HTTPException(400, str(e))

    system = "You are a research methodology expert. Generate a codebook of measurement variables."
    prompt = (
        f"Research: {req.name}\n"
        f"Hypothesis: {req.hypothesis}\n"
        f"Goals: {req.goals}\n\n"
        "Generate a JSON array of codebook variables. Each variable should have: "
        'label (string), type (one of: classify, tag, rate, extract), '
        'values (array of categories for classify/tag, [min,max] for rate, empty for extract), '
        'def (definition string).\n\n'
        "Respond with ONLY the JSON array."
    )

    result = await provider.complete(prompt, system_prompt=system)
    return {"raw": result["response"]}


@router.post("/generate/prompt")
async def generate_prompt(req: GenerateRequest):
    try:
        provider = get_provider(req.model, req.api_key)
    except ValueError as e:
        raise HTTPException(400, str(e))

    system = "You are a prompt engineering expert for LLM-based measurement."
    prompt = (
        f"Research: {req.name}\n"
        f"Goals: {req.goals}\n"
        f"Codebook: {req.codebook}\n\n"
        "Generate a system_prompt and user_prompt_template for classifying episodes. "
        'Respond as JSON: {"system_prompt": "...", "user_prompt_template": "..."}'
    )

    result = await provider.complete(prompt, system_prompt=system)
    return {"raw": result["response"]}
