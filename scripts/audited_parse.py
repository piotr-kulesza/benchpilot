"""The parse gate: parse, audit, and re-parse a bad parse instead of bundling it.

Two parses of the same document with the same prompt can differ, and one of them can
break a rule the prompt states as a MUST (measured: run 2 of the Neutrophil protocol put
the eluate tube on the "add water" step). So every live parse goes through
web/frontend/scripts/schema-audit.mjs; a parse with any audit defect is rejected loudly,
its cache entry is evicted, and the protocol is parsed again with a fresh call. After
`attempts` rejections it raises instead of returning a bad parse.

core/ stays pure: this lives in scripts/ and shells out to node for the audit, so the
rules exist once (in sceneRecipe.js) and are never re-implemented in Python.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from typing import Callable, Optional

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from core.parse import (  # noqa: E402
    LLM, SYSTEM_PROMPT, USER_TEMPLATE, _CACHE_DIR, _cache_key, _cache_put, parse_protocol,
    MalformedOutput, OutputTruncated,
)
from core.schema import Protocol  # noqa: E402

FRONTEND = os.path.join(ROOT, "web", "frontend")
AUDIT = os.path.join(FRONTEND, "scripts", "schema-audit.mjs")

# report fields that are DEFECTS (schema-audit.mjs counts the same ones)
DEFECT_FIELDS = ("unknownActions", "unknownContainers", "targetDefects", "transferHandoffDefects",
                 "prepareOnSampleDefects", "instrumentDefects", "parseInvariantDefects")


class ParseRejected(RuntimeError):
    """Every attempt broke the audit; the last attempt's defects are in the message."""


def audit(data: dict) -> list[str]:
    """Run schema-audit.mjs on one parsed protocol; return its defects, one line each."""
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False)
        path = fh.name
    try:
        res = subprocess.run(["node", AUDIT, "--file", path, "--json"], cwd=FRONTEND,
                             capture_output=True, text=True, timeout=60)
    finally:
        os.unlink(path)
    if res.returncode not in (0, 1):
        raise RuntimeError(f"schema-audit failed to run: {res.stderr.strip()[:400]}")
    entry = json.loads(res.stdout)["report"][0]
    out = []
    for field in DEFECT_FIELDS:
        for d in entry.get(field, []):
            out.append(f"{field}: step {d.get('index')} {d.get('rule') or d.get('why') or ''} "
                       f"{json.dumps({k: v for k, v in d.items() if k not in ('index', 'rule', 'why')}, ensure_ascii=False)}")
    return out


def audited_parse(text: str, *, source: str = "", llm: Optional[LLM] = None, use_cache: bool = True,
                  attempts: int = 3, log: Callable[[str], None] = print) -> Protocol:
    """parse_protocol, gated by the audit. Returns the first parse with no defects."""
    key = _cache_key(SYSTEM_PROMPT, USER_TEMPLATE.format(text=text))
    last: list[str] = []
    for attempt in range(1, attempts + 1):
        # only the first attempt may be served from the cache; a retry is a fresh call
        try:
            p = parse_protocol(text, llm=llm, source=source, use_cache=use_cache and attempt == 1)
        except OutputTruncated as exc:
            # never retried: the same input truncates again — say so, once, loudly
            log(f"!! PARSE TRUNCATED ({source or 'protocol'}): {exc}")
            raise
        except MalformedOutput as exc:
            last = [f"malformed output: {exc}"]
            log(f"!! PARSE REJECTED ({source or 'protocol'}, attempt {attempt}/{attempts}): {exc} — re-parsing")
            continue
        last = audit(p.to_dict())
        if not last:
            if use_cache and attempt > 1:
                # cache the ACCEPTED parse (a retry bypasses parse_protocol's cache write)
                _cache_put(key, _raw_of(p))
            return p
        log(f"!! PARSE REJECTED ({source or 'protocol'}, attempt {attempt}/{attempts}): "
            f"{len(last)} audit defect(s) — re-parsing")
        for line in last:
            log(f"     {line}")
        cached = os.path.join(_CACHE_DIR, key + ".txt")
        if os.path.exists(cached):
            os.remove(cached)  # never serve a rejected parse again
    raise ParseRejected(f"{source or 'protocol'}: every attempt broke the audit; last: " + "; ".join(last))


def _raw_of(p: Protocol) -> str:
    # the cache stores raw llm text; a JSON dump of the accepted parse round-trips through
    # parse_protocol's _extract_json + normalisation to the same Protocol
    return json.dumps(p.to_dict(), ensure_ascii=False)
