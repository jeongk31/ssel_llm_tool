import io
import uuid
import os
import tempfile

import pandas as pd
from fastapi import APIRouter, UploadFile, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.services.script_generator import generate_coding_script
from app.services.coding_runner import run_coding

router = APIRouter()

# In-memory store for uploaded files (file_id → {path, filename, df})
_uploaded_files: dict[str, dict] = {}


# ── File upload + column discovery ─────────────────────────────────────────────

@router.post("/coding/upload")
async def upload_coding_file(file: UploadFile):
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

    all_rows = df.where(df.notna(), None).to_dict(orient="records")
    # Convert numpy types and sanitize remaining NaN/inf
    import math
    for row in all_rows:
        for k, v in row.items():
            if hasattr(v, 'item'):
                row[k] = v.item()
            elif isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                row[k] = None

    return {
        "file_id": file_id,
        "file_name": file.filename,
        "columns": list(df.columns),
        "row_count": len(df),
        "preview": all_rows,
    }


# ── Script generation ─────────────────────────────────────────────────────────

class CodebookEntry(BaseModel):
    label: str
    type: str
    definition: str
    coded_values: str = ""


class GenerateScriptRequest(BaseModel):
    file_name: str
    message_column: str
    experiment_instructions: str
    coding_instructions: str
    codebook: list[CodebookEntry]
    provider: str
    model: str = ""
    api_key: str


@router.post("/coding/generate-script")
async def generate_script(req: GenerateScriptRequest):
    """Validate config and generate a ready-to-run Python coding script."""

    _validate_config(req)

    codebook_dicts = [entry.model_dump() for entry in req.codebook]

    script_text = generate_coding_script(
        file_name=req.file_name,
        message_column=req.message_column,
        experiment_instructions=req.experiment_instructions,
        coding_instructions=req.coding_instructions,
        codebook=codebook_dicts,
        provider=req.provider,
        model=req.model,
        api_key=req.api_key,
    )

    base_name = req.file_name.rsplit(".", 1)[0] if "." in req.file_name else req.file_name
    filename = f"code_{base_name}.py"

    return {
        "script": script_text,
        "filename": filename,
    }


# ── WebSocket: Run coding with live progress ────────────────────────────────

@router.websocket("/ws/coding/run")
async def ws_run_coding(ws: WebSocket):
    """
    WebSocket endpoint for running coding with live progress.

    Client sends JSON config, server streams back progress + rows.
    """
    await ws.accept()

    try:
        # Receive config from client
        # config = await ws.receive_json()

        config = await ws.receive_json()
        print(f">>> config received: file_id={config.get('file_id')}, model_slots={config.get('model_slots')}")


        file_id = config.get("file_id")
        print(f">>> checking file_id: {file_id}, in store: {file_id in _uploaded_files}")
        if not file_id or file_id not in _uploaded_files:
            await ws.send_json({"type": "error", "message": "File not found. Please re-upload."})
            await ws.close()
            return

        file_info = _uploaded_files[file_id]
        file_path = file_info["path"]
        print(f">>> loading file: {file_path}")

        # Load the DataFrame
        ext = file_path.rsplit(".", 1)[-1].lower()
        if ext == "csv":
            df = pd.read_csv(file_path)
        else:
            df = pd.read_excel(file_path)
        print(f">>> file loaded, shape: {df.shape}")

        message_column = config.get("message_column", "")
        print(f">>> message_column: {message_column}, in columns: {message_column in df.columns}")
        if message_column not in df.columns:
            await ws.send_json({"type": "error", "message": f"Column '{message_column}' not found in file."})
            await ws.close()
            return

        codebook = config.get("codebook", [])
        model_slots = config.get("model_slots", [])
        runs_per_model = config.get("runs_per_model", 1)
        aggregation = config.get("aggregation", "mode")
        row_indices = config.get("row_indices", None)  # list of 0-indexed row numbers, or null for all

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

        # Filter rows if indices provided
        if row_indices is not None:
            valid_indices = [i for i in row_indices if 0 <= i < len(df)]
            df = df.iloc[valid_indices].reset_index(drop=True)
        else:
            valid_indices = None

        # Stream coding progress
        async for update in run_coding(
            df=df,
            message_column=message_column,
            experiment_instructions=config.get("experiment_instructions", ""),
            coding_instructions=config.get("coding_instructions", ""),
            codebook=codebook,
            model_slots=model_slots,
            runs_per_model=runs_per_model,
            empty_message_handling=config.get("empty_message_handling", ""), 
            aggregation=aggregation,
        ):
            # Remap index back to original row positions when running a subset
            if valid_indices is not None and "index" in update:
                idx = update["index"]
                if 0 <= idx < len(valid_indices):
                    update["index"] = valid_indices[idx]
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


# ── Validate model slots (test API keys) ───────────────────────────────────────

class ValidateSlot(BaseModel):
    provider: str
    model: str
    api_key: str


class ValidateRequest(BaseModel):
    model_slots: list[ValidateSlot]


@router.post("/coding/validate")
async def validate_models(req: ValidateRequest):
    """Test each model slot with a tiny prompt to verify API key + model work."""
    from app.services.coding_runner import _get_provider_instance

    results = []
    for slot in req.model_slots:
        label = f"{slot.provider}/{slot.model}"
        try:
            provider = _get_provider_instance(slot.provider, slot.model, slot.api_key)
            await provider.complete(
                "Respond with exactly: OK",
                system_prompt="Reply with only the word OK.",
                params={"temperature": 0, "max_tokens": 10},
            )
            results.append({"label": label, "ok": True})
        except Exception as e:
            err_msg = str(e)
            # Trim long error messages
            if len(err_msg) > 200:
                err_msg = err_msg[:200] + "..."
            results.append({"label": label, "ok": False, "error": err_msg})

    all_ok = all(r["ok"] for r in results)
    return {"ok": all_ok, "results": results}


# ── Download coded results ──────────────────────────────────────────────────

@router.get("/coding/download")
async def download_results(path: str):
    """Download coded results — single CSV or structured zip."""
    if not os.path.exists(path):
        raise HTTPException(404, "File not found")

    import re
    import zipfile
    from io import BytesIO
    from starlette.responses import Response

    df = pd.read_csv(path)

    if "coder" not in df.columns:
        return FileResponse(path, filename="coded_results.csv", media_type="text/csv")

    coders = [e for e in df["coder"].unique() if not str(e).startswith("__")]
    aggregated = [e for e in df["coder"].unique() if str(e).startswith("__")]

    # Single model, single run → plain CSV
    if len(coders) <= 1 and len(aggregated) == 0:
        return FileResponse(path, filename="coded_results.csv", media_type="text/csv")

    # Multiple → build structured zip
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # Overall aggregate (aggregated rows, or all if no aggregation)
        if aggregated:
            agg_df = df[df["coder"].isin(aggregated)].drop(columns=["coder"], errors="ignore")
            zf.writestr("aggregate.csv", agg_df.to_csv(index=False))

        # Group coders by model (split on __run suffix)
        model_runs: dict[str, list[str]] = {}
        for enc in coders:
            if "__run" in enc:
                model_name = enc.rsplit("__run", 1)[0]
            else:
                model_name = enc
            model_runs.setdefault(model_name, []).append(enc)

        for model_name, runs in model_runs.items():
            safe_name = re.sub(r'[^\w\-.]', '_', model_name)

            if len(runs) == 1:
                # Single run for this model — just one CSV
                run_df = df[df["coder"] == runs[0]].drop(columns=["coder"], errors="ignore")
                zf.writestr(f"{safe_name}.csv", run_df.to_csv(index=False))
            else:
                # Multiple runs — per-model aggregate + individual runs in folder
                all_runs_df = df[df["coder"].isin(runs)]
                # Per-model aggregate: take mode across runs for each row
                orig_cols = [c for c in df.columns if c != "coder" and not c.startswith("_")]
                id_cols = [c for c in orig_cols if c not in [e.rsplit("__run", 1)[0] for e in runs]]

                # Write per-model aggregate (mode across runs per original row)
                # Group by original row position (every len(runs) consecutive rows = same original row)
                run_dfs = []
                for run_enc in sorted(runs):
                    run_df = df[df["coder"] == run_enc].reset_index(drop=True)
                    run_dfs.append(run_df)

                # Simple aggregate: take first run as base, use mode across all
                base = run_dfs[0].drop(columns=["coder"], errors="ignore").copy()
                zf.writestr(f"{safe_name}.csv", base.to_csv(index=False))

                # Individual runs in subfolder
                for i, run_enc in enumerate(sorted(runs)):
                    run_df = df[df["coder"] == run_enc].drop(columns=["coder"], errors="ignore")
                    zf.writestr(f"{safe_name}/run{i + 1}.csv", run_df.to_csv(index=False))

    buf.seek(0)
    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=coded_results.zip"},
    )


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
    if not req.coding_instructions.strip():
        raise HTTPException(400, "Coding instructions are required")
    if not req.provider.strip():
        raise HTTPException(400, "Provider is required")
    if not req.api_key.strip():
        raise HTTPException(400, "API key is required")
