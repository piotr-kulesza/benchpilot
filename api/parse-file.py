# Vercel serverless function — POST /api/parse-file
#
# Parse an uploaded .docx / .txt / .md and return the schema dict. Multipart is decoded with
# the stdlib email parser (no extra dependency). use_cache=False (read-only serverless FS).
from http.server import BaseHTTPRequestHandler
import email
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # → import core

MAX_FILE = 5_000_000  # 5 MB upload cap


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self._cors(204)

    def do_POST(self):
        if not os.environ.get("ANTHROPIC_API_KEY"):
            return self._json(503, {"error": "ANTHROPIC_API_KEY not set — the bundled examples still work with no backend."})
        length = int(self.headers.get("content-length") or 0)
        ctype = self.headers.get("content-type") or ""
        if length <= 0 or length > MAX_FILE or "multipart/form-data" not in ctype:
            return self._json(413, {"error": "empty, too large, or not multipart"})

        raw = self.rfile.read(length)
        # reconstruct a MIME document so the stdlib email parser can split the parts
        msg = email.message_from_bytes(
            b"Content-Type: " + ctype.encode("utf-8") + b"\r\nMIME-Version: 1.0\r\n\r\n" + raw
        )
        filename, content = None, None
        for part in msg.walk():
            if part.get_filename():
                filename = part.get_filename()
                content = part.get_payload(decode=True)
                break
        if not content:
            return self._json(400, {"error": "no file field"})

        suffix = os.path.splitext(filename or "")[1] or ".docx"
        tmp = os.path.join(tempfile.gettempdir(), "benchpilot-upload" + suffix)
        try:
            with open(tmp, "wb") as fh:
                fh.write(content)
            from core.ingest import ingest
            from core.parse import parse_protocol

            proto = parse_protocol(ingest(tmp), source=filename or "upload", use_cache=False)
            return self._json(200, proto.to_dict())
        except Exception as exc:
            return self._json(502, {"error": "parse failed", "detail": str(exc)[:200]})
        finally:
            try:
                os.remove(tmp)
            except OSError:
                pass

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
