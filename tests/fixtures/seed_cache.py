"""Seed the offline coverage cache — run ONCE with ANTHROPIC_API_KEY.

Parses each fixture protocol through the REAL core.parse pipeline (a urllib-injected
llm, no SDK needed) and commits the raw LLM responses under tests/fixtures/cache/.
The offline harness (tests/test_coverage.py) re-parses those cached responses with a
fake llm, so CI needs no network and no key.

Usage:  python tests/fixtures/seed_cache.py            # all 8
        python tests/fixtures/seed_cache.py pcr western
"""
from __future__ import annotations
import json
import os
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

# load ANTHROPIC_API_KEY from the repo-root .env (existing env wins)
_env = os.path.join(ROOT, ".env")
if os.path.exists(_env):
    for line in open(_env, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            k, v = k.strip(), v.strip().strip('"').strip("'")
            os.environ.setdefault(k, v)

from core.parse import parse_protocol, DEFAULT_MODEL, SYSTEM_PROMPT, USER_TEMPLATE  # noqa: E402

FIX = os.path.dirname(os.path.abspath(__file__))
PROTO_DIR = os.path.join(FIX, "protocols")
CACHE_DIR = os.path.join(FIX, "cache")
ALL = ["transformation", "pcr", "western", "passaging", "elisa",
       "agarose_gel", "cryopreservation", "gram_stain"]


def live_llm(system: str, user: str) -> str:
    body = json.dumps({
        "model": DEFAULT_MODEL, "max_tokens": 20000, "system": system,
        "messages": [{"role": "user", "content": user}],
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages", data=body, method="POST",
        headers={"x-api-key": os.environ["ANTHROPIC_API_KEY"],
                 "anthropic-version": "2023-06-01", "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")


def main() -> None:
    os.makedirs(CACHE_DIR, exist_ok=True)
    names = sys.argv[1:] or ALL
    raw_by_name = {}

    def capturing_llm(system, user):
        raw = live_llm(system, user)
        raw_by_name["_last"] = raw
        return raw

    for name in names:
        text = open(os.path.join(PROTO_DIR, name + ".txt"), encoding="utf-8").read()
        proto = parse_protocol(text, llm=capturing_llm, source=name + ".txt", use_cache=False)
        raw = raw_by_name["_last"]
        with open(os.path.join(CACHE_DIR, name + ".txt"), "w", encoding="utf-8") as fh:
            fh.write(raw)
        n = len(proto.steps)
        gen = sum(1 for s in proto.steps if s.action == "generic")
        print(f"{name:<18} {n:>2} steps | generic {gen} ({100*gen/max(n,1):.0f}%) -> cache/{name}.txt")


if __name__ == "__main__":
    main()
