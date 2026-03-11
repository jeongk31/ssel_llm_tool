import io

import pandas as pd
from fastapi import APIRouter, UploadFile, HTTPException

router = APIRouter()


@router.post("/files/upload")
async def upload_file(file: UploadFile):
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

    preview = df.head(10).where(df.notna(), None).to_dict(orient="records")

    return {
        "file_name": file.filename,
        "columns": list(df.columns),
        "row_count": len(df),
        "preview": preview,
    }
