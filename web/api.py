"""OPTIONAL STRETCH — live-parse backend for the player.

This is the "paste anything" wow: a thin FastAPI wrapper around the real `core`
pipeline so the UI can ingest a NEW protocol live. It is entirely optional:

  * The player defaults to the bundled `public/parsed.json` and needs NO backend.
  * The offline tests never touch this file (fastapi is not a test dependency).
  * A live parse needs ANTHROPIC_API_KEY; without it, /api/parse returns 503 but
    the bundled-example demo path is unaffected.

Run it (only if you want the live path):

    pip install fastapi "uvicorn[standard]" python-multipart
    uvicorn web.api:app --reload --port 8000

Then start the frontend with the endpoint pointed at it:

    VITE_API_BASE=http://localhost:8000 npm run dev

The parse core stays untouched — this just calls it.
"""

from __future__ import annotations

import os
import sys

# make `core` importable when run from the repo root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from fastapi import FastAPI, HTTPException, UploadFile, File, Form
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
except ImportError as exc:  # pragma: no cover - optional dependency
    raise SystemExit(
        "web/api.py needs fastapi. Install with:\n"
        "  pip install fastapi 'uvicorn[standard]' python-multipart"
    ) from exc

from core.ingest import ingest        # noqa: E402
from core.parse import parse_protocol  # noqa: E402

app = FastAPI(title="benchpilot live-parse")

# Dev-friendly CORS so a Vite dev server can call this. Tighten for real use.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ParseTextRequest(BaseModel):
    text: str


def _require_key() -> None:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY not set — live parse unavailable. The bundled "
            "example still works with no backend.",
        )


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "live_parse": bool(os.environ.get("ANTHROPIC_API_KEY"))}


@app.post("/api/parse")
def parse_text(req: ParseTextRequest) -> dict:
    """Parse pasted protocol text and return the schema dict."""
    _require_key()
    text = ingest(req.text)
    protocol = parse_protocol(text, source="pasted")
    return protocol.to_dict()


@app.post("/api/parse-file")
async def parse_file(file: UploadFile = File(...)) -> dict:
    """Parse an uploaded .docx / .txt / .md and return the schema dict."""
    _require_key()
    suffix = os.path.splitext(file.filename or "")[1] or ".docx"
    tmp = os.path.join("/tmp", f"benchpilot-upload{suffix}")
    with open(tmp, "wb") as fh:
        fh.write(await file.read())
    try:
        text = ingest(tmp)
        protocol = parse_protocol(text, source=file.filename or "upload")
        return protocol.to_dict()
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass
