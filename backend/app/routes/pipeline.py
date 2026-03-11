from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

router = APIRouter()


class PipelineRunRequest(BaseModel):
    api_keys: dict[str, str]  # provider -> key
    data: list[dict]
    codebook: list[dict]
    prompt_template: str
    system_prompt: str
    models: list[dict]
    run_settings: dict


@router.post("/pipeline/run")
async def run_pipeline(req: PipelineRunRequest):
    # TODO: launch pipeline runner as background task, return run_id
    return {"run_id": "placeholder", "status": "not_implemented"}


@router.websocket("/ws/pipeline/{run_id}")
async def pipeline_ws(websocket: WebSocket, run_id: str):
    await websocket.accept()
    try:
        # TODO: stream pipeline progress via queue
        await websocket.send_json({"type": "status", "payload": {"message": "connected", "run_id": run_id}})
        while True:
            data = await websocket.receive_text()  # keep alive
    except WebSocketDisconnect:
        pass
