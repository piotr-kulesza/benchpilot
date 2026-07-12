"""Re-parse the prep-bearing example fixtures with the LIVE llm (current prompt), refreshing
the committed raw responses in tests/fixtures/cache/ so gen_examples.py can rebuild them
offline. Only the examples that carry a `prepare` step need refreshing for Stage 34
(target / produces / draws_from + prep timing); the rest are left untouched to avoid drift.
Needs ANTHROPIC_API_KEY (loaded from .env). One batched call per protocol.

    python scripts/reparse_examples.py [pid ...]
"""
from __future__ import annotations
import os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

# load .env (same as parse_check)
envp = os.path.join(ROOT, ".env")
if os.path.exists(envp):
    for line in open(envp, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

from core.parse import parse_protocol, default_llm  # noqa: E402

FIX = os.path.join(ROOT, "tests", "fixtures")
# the examples that contain a side preparation (Stage 33 survey)
DEFAULT_PIDS = ["transformation", "pcr", "elisa", "agarose_gel"]
PIDS = sys.argv[1:] or DEFAULT_PIDS

llm = default_llm()
for pid in PIDS:
    text = open(os.path.join(FIX, "protocols", pid + ".txt"), encoding="utf-8").read()
    captured = {}

    def rec(system, user, _c=captured):
        raw = llm(system, user)
        _c["raw"] = raw
        return raw

    parse_protocol(text, llm=rec, source=pid + ".txt", use_cache=False)  # validates it parses
    with open(os.path.join(FIX, "cache", pid + ".txt"), "w", encoding="utf-8") as fh:
        fh.write(captured["raw"])
    print(f"  re-parsed {pid} ({len(captured['raw'])} chars)")
print("done")
