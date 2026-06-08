# from fastapi import APIRouter, HTTPException
# from pydantic import BaseModel
# import json

# from app.services.providers import get_provider

# router = APIRouter()

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
import json

from app.services.providers import get_provider
from app.services.category_runner import run_category_generation

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
    domain: str | None = None

# Category Generator
class CategoryGenerateRequest(BaseModel):
    api_key: str
    model: str
    provider: str
    goals: str = ""
    hypothesis: str = ""
    domain: str = ""
    references: str | None = None
    output_type: str = ""
    target_count: int | None = None
    data_sample: list[dict] | None = None

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


# @router.post("/generate/categories")
# async def generate_categories(req: CategoryGenerateRequest):
#     try:
#         provider = get_provider(req.model, req.api_key)
#     except ValueError as e:
#         raise HTTPException(400, str(e))

#     system = "You are an expert in qualitative behavioral coding. Generate structured categories with labels, definitions, inclusions/exclusion criteria, and example phrases."
#     prompt = (
#         f"Goals: {req.goals}\n"
#         f"Hypothesis: {req.hypothesis}\n"
#         f"Output type: {req.output_type}\n"
#         f"Target number of categories: {req.target_count}\n"
#         f"Domain: {req.domain}\n"
#         f"References: {req.references if req.references else ''}\n"
#         f"Sample episodes: {json.dumps(req.data_sample) if req.data_sample else '[]'}\n\n"
#         "Generate a JSON array of categories. Each should include: \n"
#         "- label(string)\n"
#         "- definition (string)\n"
#         "- include(string)\n"
#         "- exclude (string)\n"
#         "- example (string)\n\n"
#         "Return ONLY a raw JSON array. No markdown. No code fences. No explanation. The response must start with [ and end with ]."
#         )

#     result = await provider.complete(prompt, system_prompt=system)
#     return {"raw": result["response"]}



@router.websocket("/ws/generate/categories")
async def ws_generate_categories(ws: WebSocket):
    await ws.accept()
    try:
        config = await ws.receive_json()

        async for update in run_category_generation(
            provider=config.get("provider", ""),
            model=config.get("model", ""),
            api_key=config.get("api_key", ""),
            goals=config.get("goals", ""),
            hypothesis=config.get("hypothesis", ""),
            output_type=config.get("output_type", "classify"),
            target_count=config.get("target_count"),
            domain=config.get("domain", ""),
            references=config.get("references", ""),
            data_sample=config.get("data_sample"),
        ):
            await ws.send_json(update)

        await ws.close()

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await ws.send_json({"type": "error", "message": str(e)})
            await ws.close()
        except Exception:
            pass

# @router.websocket("/ws/generate/categories")
# async def ws_generate_categories(ws: WebSocket):
#     print(f"WS headers: {dict(ws.headers)}")
#     await ws.accept()
