"""Routes for inter-rater agreement analysis."""

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.routes.coding import UploadResolutionError, resolve_uploaded_file
from app.services.agreement_service import cross_check, compute_agreement

router = APIRouter()


class RaterSpec(BaseModel):
    file_id: str
    name: str
    rater_type: Literal["human", "llm"]


class CrossCheckRequest(BaseModel):
    raters: list[RaterSpec]
    episode_columns: list[str]
    analysis_variables: list[str]


class ComputeRequest(BaseModel):
    raters: list[RaterSpec]
    episode_columns: list[str]
    analysis_variables: list[str]


def _resolve_rater_uploads(raters: list[dict]) -> dict[str, dict]:
    """Resolve available rater files without changing existing missing-file results."""
    resolved: dict[str, dict] = {}
    attempted: set[str] = set()
    for rater in raters:
        file_id = rater.get("file_id")
        if not file_id or file_id in attempted:
            continue
        attempted.add(file_id)
        try:
            resolved[file_id] = resolve_uploaded_file(file_id)
        except UploadResolutionError:
            # cross_check reports the rater as missing; compute_agreement keeps
            # its established "Need at least 2 raters" behavior when necessary.
            continue
    return resolved


@router.post("/agreement/cross-check")
async def do_cross_check(req: CrossCheckRequest):
    """Validate rater files have required columns and compute episode overlap."""
    if len(req.raters) < 2:
        raise HTTPException(400, "At least 2 raters required")
    if not req.episode_columns:
        raise HTTPException(400, "At least 1 episode column required")
    if not req.analysis_variables:
        raise HTTPException(400, "At least 1 analysis variable required")

    rater_dicts = [r.model_dump() for r in req.raters]
    uploaded_files = _resolve_rater_uploads(rater_dicts)
    result = cross_check(rater_dicts, uploaded_files, req.episode_columns, req.analysis_variables)
    return result


@router.post("/agreement/compute")
async def do_compute(req: ComputeRequest):
    """Compute inter-rater agreement metrics."""
    if len(req.raters) < 2:
        raise HTTPException(400, "At least 2 raters required")
    if not req.episode_columns:
        raise HTTPException(400, "At least 1 episode column required")
    if not req.analysis_variables:
        raise HTTPException(400, "At least 1 analysis variable required")

    rater_dicts = [r.model_dump() for r in req.raters]
    uploaded_files = _resolve_rater_uploads(rater_dicts)
    result = compute_agreement(rater_dicts, uploaded_files, req.episode_columns, req.analysis_variables)

    if "error" in result:
        raise HTTPException(400, result["error"])

    return result
