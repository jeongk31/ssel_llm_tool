"""Routes for inter-rater agreement analysis."""

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.routes.coding import _uploaded_files
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
    result = cross_check(rater_dicts, _uploaded_files, req.episode_columns, req.analysis_variables)
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
    result = compute_agreement(rater_dicts, _uploaded_files, req.episode_columns, req.analysis_variables)

    if "error" in result:
        raise HTTPException(400, result["error"])

    return result
