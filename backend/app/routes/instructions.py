from fastapi import APIRouter, UploadFile, Form, HTTPException

from app.services.coding_runner import _get_provider_instance

router = APIRouter()

# Providers/models that support native PDF (document + vision) processing.
# Keep in sync with the PDF_MODELS list in the frontend.
PDF_CAPABLE_PROVIDERS = {"openai", "gemini", "anthropic"}

MAX_PDF_BYTES = 25 * 1024 * 1024  # 25 MB

CONVERT_SYSTEM = (
    "You convert an experiment-instructions document into clean, faithful plain text "
    "that a language model can later use as context. You never summarise or omit content."
)

CONVERT_PROMPT = (
    "Convert the attached PDF of experiment instructions into plain text.\n\n"
    "Rules:\n"
    "- Transcribe ALL text faithfully, preserving the original wording, order, headings and lists.\n"
    "- For every figure, chart, graph, diagram, screenshot or image, insert an inline description "
    "delimited like this: [FIGURE: <a clear, complete description of what the figure shows, including "
    "any axes, labels, values, and what a participant would understand from it>].\n"
    "- For every table, reproduce it as readable text (rows and columns), preserving all cell values.\n"
    "- Do not add commentary, notes, or anything that is not in the document.\n"
    "- Output ONLY the converted text."
)


@router.post("/instructions/convert-pdf")
async def convert_pdf(
    file: UploadFile,
    provider: str = Form(...),
    model: str = Form(...),
    api_key: str = Form(...),
):
    if not file.filename:
        raise HTTPException(400, "No file provided")
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are supported")
    if provider not in PDF_CAPABLE_PROVIDERS:
        raise HTTPException(400, f"Provider '{provider}' does not support PDF conversion.")
    if not api_key.strip():
        raise HTTPException(400, "An API key is required to convert the PDF.")

    pdf_bytes = await file.read()
    if not pdf_bytes:
        raise HTTPException(400, "The uploaded PDF is empty.")
    if len(pdf_bytes) > MAX_PDF_BYTES:
        raise HTTPException(400, "PDF is too large (max 25 MB).")

    try:
        provider_inst = _get_provider_instance(provider, model, api_key)
    except ValueError as e:
        raise HTTPException(400, str(e))

    try:
        result = await provider_inst.complete_with_pdf(
            CONVERT_PROMPT, pdf_bytes, system_prompt=CONVERT_SYSTEM
        )
    except NotImplementedError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(502, f"PDF conversion failed: {e}")

    text = (result.get("response") or "").strip()
    if not text:
        raise HTTPException(502, "The model returned no text for this PDF.")

    return {"text": text, "tokens_used": result.get("tokens_used", 0)}
