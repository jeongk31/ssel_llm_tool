import io
import uuid
import os
import tempfile

import pandas as pd
from fastapi import APIRouter, UploadFile, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.services.script_generator import generate_encoding_script
from app.services.encoding_runner import run_encoding

router = APIRouter()

# In-memory store for uploaded files (file_id → {path, filename, df})
_uploaded_files: dict[str, dict] = {}


# ── File upload + column discovery ─────────────────────────────────────────────

@router.post("/encoding/upload")
async def upload_encoding_file(file: UploadFile):
    """Upload a CSV/Excel file, save temporarily, return columns + preview."""
    if not file.filename:
        raise HTTPException(400, "No file provided")

    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in ("csv", "xlsx", "xls"):
        raise HTTPException(400, f"Unsupported file type: .{ext}")

    content = await file.read()

    try:
        if ext == "csv":
            df = pd.read_csv(io.BytesIO(content))
        else:
            df = pd.read_excel(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(400, f"Failed to parse file: {e}")

    # Save to temp file
    file_id = str(uuid.uuid4())[:8]
    tmp_dir = tempfile.mkdtemp(prefix="llm_upload_")
    tmp_path = os.path.join(tmp_dir, file.filename)
    with open(tmp_path, "wb") as f:
        f.write(content)

    _uploaded_files[file_id] = {
        "path": tmp_path,
        "filename": file.filename,
    }

    preview = df.head(5).where(df.notna(), None).to_dict(orient="records")
    # Convert numpy types in preview
    for row in preview:
        for k, v in row.items():
            if hasattr(v, 'item'):
                row[k] = v.item()

    return {
        "file_id": file_id,
        "file_name": file.filename,
        "columns": list(df.columns),
        "row_count": len(df),
        "preview": preview,
    }


# ── Script generation ─────────────────────────────────────────────────────────

class CodebookEntry(BaseModel):
    label: str
    type: str
    definition: str
    encoded_values: str = ""


class GenerateScriptRequest(BaseModel):
    file_name: str
    message_column: str
    experiment_instructions: str
    encoding_instructions: str
    codebook: list[CodebookEntry]
    provider: str
    model: str = ""
    api_key: str


@router.post("/encoding/generate-script")
async def generate_script(req: GenerateScriptRequest):
    """Validate config and generate a ready-to-run Python encoding script."""

    _validate_config(req)

    codebook_dicts = [entry.model_dump() for entry in req.codebook]

    script_text = generate_encoding_script(
        file_name=req.file_name,
        message_column=req.message_column,
        experiment_instructions=req.experiment_instructions,
        encoding_instructions=req.encoding_instructions,
        codebook=codebook_dicts,
        provider=req.provider,
        model=req.model,
        api_key=req.api_key,
    )

    base_name = req.file_name.rsplit(".", 1)[0] if "." in req.file_name else req.file_name
    filename = f"encode_{base_name}.py"

    return {
        "script": script_text,
        "filename": filename,
    }


# ── WebSocket: Run encoding with live progress ────────────────────────────────

@router.websocket("/ws/encoding/run")
async def ws_run_encoding(ws: WebSocket):
    """
    WebSocket endpoint for running encoding with live progress.

    Client sends JSON config, server streams back progress + rows.
    """
    await ws.accept()

    try:
        # Receive config from client
        config = await ws.receive_json()

        file_id = config.get("file_id")
        if not file_id or file_id not in _uploaded_files:
            await ws.send_json({"type": "error", "message": "File not found. Please re-upload."})
            await ws.close()
            return

        file_info = _uploaded_files[file_id]
        file_path = file_info["path"]

        # Load the DataFrame
        ext = file_path.rsplit(".", 1)[-1].lower()
        if ext == "csv":
            df = pd.read_csv(file_path)
        else:
            df = pd.read_excel(file_path)

        message_column = config.get("message_column", "")
        if message_column not in df.columns:
            await ws.send_json({"type": "error", "message": f"Column '{message_column}' not found in file."})
            await ws.close()
            return

        codebook = config.get("codebook", [])
        model_slots = config.get("model_slots", [])
        runs_per_model = config.get("runs_per_model", 1)
        aggregation = config.get("aggregation", "mode")

        # Support legacy single-model format
        if not model_slots:
            provider = config.get("provider", "")
            model_id = config.get("model", "")
            api_key = config.get("api_key", "")
            if provider and api_key:
                model_slots = [{"provider": provider, "model": model_id, "api_key": api_key}]

        if not codebook or not model_slots:
            await ws.send_json({"type": "error", "message": "Missing required config fields."})
            await ws.close()
            return

        # Stream encoding progress
        async for update in run_encoding(
            df=df,
            message_column=message_column,
            experiment_instructions=config.get("experiment_instructions", ""),
            encoding_instructions=config.get("encoding_instructions", ""),
            codebook=codebook,
            model_slots=model_slots,
            runs_per_model=runs_per_model,
            aggregation=aggregation,
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


# ── Download encoded results ──────────────────────────────────────────────────

@router.get("/encoding/download")
async def download_results(path: str):
    """Download the encoded results CSV."""
    if not os.path.exists(path):
        raise HTTPException(404, "File not found")
    return FileResponse(path, filename="encoded_results.csv", media_type="text/csv")


# ── Validation helper ─────────────────────────────────────────────────────────

def _validate_config(req: GenerateScriptRequest):
    if not req.codebook or len(req.codebook) == 0:
        raise HTTPException(400, "Codebook must have at least one entry")

    for i, entry in enumerate(req.codebook):
        if not entry.label.strip():
            raise HTTPException(400, f"Codebook entry {i + 1}: label is required")
        if not entry.type.strip():
            raise HTTPException(400, f"Codebook entry {i + 1}: type is required")
        if not entry.definition.strip():
            raise HTTPException(400, f"Codebook entry {i + 1}: definition is required")

    if not req.message_column.strip():
        raise HTTPException(400, "Message column is required")
    if not req.experiment_instructions.strip():
        raise HTTPException(400, "Experiment instructions are required")
    if not req.encoding_instructions.strip():
        raise HTTPException(400, "Encoding instructions are required")
    if not req.provider.strip():
        raise HTTPException(400, "Provider is required")
    if not req.api_key.strip():
        raise HTTPException(400, "API key is required")
