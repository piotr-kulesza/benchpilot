# Vercel serverless function — POST /api/parse
#
# Parse PASTED protocol text through the real `core` pipeline and return the schema dict.
# The parse core is unchanged; this only calls it. use_cache=False because the serverless
# filesystem is read-only (core's disk cache would raise otherwise).
from http.server import BaseHTTPRequestHandler
import json
import os
import sys

# core/ lives at the repo root; ship it with the function via vercel.json includeFiles.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

MAX_TEXT = 120_000  # a big protocol is a few KB; cap the model's input (cost/abuse)


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self._cors(204)

    def do_POST(self):
        if not os.environ.get("ANTHROPIC_API_KEY"):
            return self._json(503, {
                "error": "ANTHROPIC_API_KEY not set — live parse unavailable. "
                         "The bundled examples still work with no backend.",
            })
        length = int(self.headers.get("content-length") or 0)
        if length <= 0 or length > MAX_TEXT:
            return self._json(413, {"error": "empty or too large"})
        try:
            data = json.loads(self.rfile.read(length))
        except Exception:
            return self._json(400, {"error": "bad json"})
        text = str(data.get("text") or "").strip()
        if not text:
            return self._json(400, {"error": "no text"})
        try:
            from core.ingest import ingest
            from core.parse import parse_protocol

            proto = parse_protocol(ingest(text), source="pasted", use_cache=False)
        except Exception as exc:  # never leak a stack trace to the browser
            return self._json(502, {"error": "parse failed", "detail": str(exc)[:200]})
        return self._json(200, proto.to_dict())

    # ── response helpers ──────────────────────────────────────────────────────
    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _cors(self, code):
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
