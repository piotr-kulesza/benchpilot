# Vercel serverless entrypoint — the benchpilot live-parse + voice-intent API.
#
# A single FastAPI app (all routes carry the /api prefix; vercel.json rewrites every
# /api/* request here). Self-contained so it's the ONLY Python entrypoint Vercel sees;
# web/api.py stays the local-dev server (excluded from the deploy via .vercelignore).
# use_cache=False everywhere: the serverless filesystem is read-only.
import os
import sys
import tempfile

# core/ lives at the repo root (uploaded alongside this function).
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from core.ingest import ingest
from core.parse import MalformedOutput, OutputTruncated
from core.validate import ParseFailedValidation, parse_validated

app = FastAPI(title="benchpilot api")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

INTENT_MODEL = os.environ.get("BENCHPILOT_INTENT_MODEL", "claude-haiku-4-5-20251001")


def _validated(text: str, source: str) -> dict:
    """Parse through the vessel-rule gate (core/validate.py). A parse that breaks a rule
    is re-parsed; if every attempt breaks one the user gets a 422 naming the rules, never
    the bad parse. If the rules cannot be applied the parse is returned LABELLED
    validation.status = "unchecked" — the UI shows that the run was not checked."""
    try:
        return parse_validated(text, source=source)
    except OutputTruncated as exc:
        # distinct from a rule failure: a truncated parse is the protocol being too long
        # for one pass, not the parse being wrong — never retried (it would truncate again)
        raise HTTPException(status_code=413, detail=(
            f"This protocol is too long to parse in one pass: the parse output was truncated "
            f"({exc}). Nothing was shown. Try pasting one section of the protocol at a time.")) from exc
    except MalformedOutput as exc:
        raise HTTPException(status_code=502, detail=(
            f"The parser returned invalid output on every attempt ({exc}). Please try again.")) from exc
    except ParseFailedValidation as exc:
        raise HTTPException(status_code=422, detail=(
            "This protocol parsed, but the result broke the parse rules on every attempt "
            f"({exc}). It was not shown, because a run that puts the sample in the wrong "
            "vessel would teach the wrong thing. Try again, or simplify the text.")) from exc


def _require_key() -> None:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY not set — live parse/voice unavailable. "
            "The bundled examples still work with no backend.",
        )


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "live_parse": bool(os.environ.get("ANTHROPIC_API_KEY"))}


class ParseTextRequest(BaseModel):
    text: str


@app.post("/api/parse")
def parse_text(req: ParseTextRequest) -> dict:
    _require_key()
    return _validated(ingest(req.text), source="pasted")


class IntentRequest(BaseModel):
    system: str
    user: str


@app.post("/api/intent")
def resolve_intent(req: IntentRequest) -> dict:
    """Relay a voice-intent prompt to a small, fast model; return its raw text."""
    _require_key()
    import anthropic  # lazy

    client = anthropic.Anthropic()
    msg = client.messages.create(
        model=INTENT_MODEL,
        max_tokens=256,
        system=req.system,
        messages=[{"role": "user", "content": req.user}],
    )
    return {"text": "".join(getattr(b, "text", "") for b in msg.content)}


@app.post("/api/parse-file")
async def parse_file(file: UploadFile = File(...)) -> dict:
    _require_key()
    suffix = os.path.splitext(file.filename or "")[1] or ".docx"
    tmp = os.path.join(tempfile.gettempdir(), "benchpilot-upload" + suffix)
    try:
        with open(tmp, "wb") as fh:
            fh.write(await file.read())
        return _validated(ingest(tmp), source=file.filename or "upload")
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass
