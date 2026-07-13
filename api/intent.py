# Vercel serverless function — POST /api/intent
#
# Relay a voice-intent prompt to a small, fast model and return its RAW text. This holds
# the API key server-side; the browser builds the (short) system+user prompt and validates
# the reply against its closed action set (voiceIntent.js / voiceDispatch.js). No protocol
# or intent logic lives here — pure transport, mirroring web/api.py's /api/intent.
from http.server import BaseHTTPRequestHandler
import json
import os

MODEL = os.environ.get("BENCHPILOT_INTENT_MODEL", "claude-haiku-4-5-20251001")
MAX_BODY = 200_000  # ~200 KB: a step + the protocol outline, never more (cost/abuse cap)


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self._cors(204)

    def do_POST(self):
        if not os.environ.get("ANTHROPIC_API_KEY"):
            return self._json(503, {"error": "ANTHROPIC_API_KEY not set"})
        length = int(self.headers.get("content-length") or 0)
        if length <= 0 or length > MAX_BODY:
            return self._json(413, {"error": "empty or too large"})
        try:
            data = json.loads(self.rfile.read(length))
        except Exception:
            return self._json(400, {"error": "bad json"})
        system = str(data.get("system") or "")[:24000]
        user = str(data.get("user") or "")[:60000]
        try:
            import anthropic

            client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env
            msg = client.messages.create(
                model=MODEL,
                max_tokens=256,  # one-line JSON command, or a 1-2 sentence spoken answer
                system=system,
                messages=[{"role": "user", "content": user}],
            )
            text = "".join(getattr(b, "text", "") for b in msg.content)
        except Exception:
            return self._json(502, {"error": "intent unavailable"})
        return self._json(200, {"text": text})

    # ── response helpers ──────────────────────────────────────────────────────
    def _json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
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
