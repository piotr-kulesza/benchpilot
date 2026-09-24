"""Parse protocols FRESH with the live llm and the CURRENT prompt, saving each raw
response to tests/fixtures/fresh_parse/<name>.txt. Nothing bundled is touched: this
only produces evidence (fresh parses to merge conditions from, to measure drift
against the bundled parses, and to measure run-to-run stability).

Needs ANTHROPIC_API_KEY (loaded from .env). One batched call per protocol, run
concurrently. The cache is bypassed so every call is a real, independent parse.

    python scripts/fresh_parse.py neutrophil_rna pcr ...     # bundled protocol ids
    python scripts/fresh_parse.py neutrophil_rna@2           # a second, independent run
"""
from __future__ import annotations

import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

envp = os.path.join(ROOT, ".env")
if os.path.exists(envp):
    for line in open(envp, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

from core.ingest import ingest  # noqa: E402
from core.parse import default_llm, default_token_counter  # noqa: E402
from audited_parse import audited_parse  # noqa: E402  (a bad parse is re-parsed, never saved)

FIX = os.path.join(ROOT, "tests", "fixtures")
OUT = os.path.join(FIX, "fresh_parse")
RNA_DOCX = os.path.join(ROOT, "examples", "Protokol_ekstrakcji_RNA_neutrofile.docx")


def source_text(pid: str) -> tuple[str, str]:
    """(text, source label) for a bundled protocol id, or a path to any protocol file."""
    if pid == "neutrophil_rna":
        return ingest(RNA_DOCX), os.path.basename(RNA_DOCX)
    fx = os.path.join(FIX, "protocols", pid + ".txt")
    if os.path.exists(fx):
        return open(fx, encoding="utf-8").read(), pid + ".txt"
    return ingest(pid), os.path.basename(pid)


def run(name: str) -> str:
    pid = name.split("@")[0]
    text, src = source_text(pid)
    llm = default_llm()
    label = os.path.splitext(os.path.basename(name))[0] if os.path.sep in name else name.replace("@", "__run")
    attempts: list[dict] = []   # EVERY call — accepted, rejected or dropped — is evidence

    def rec(system: str, user: str) -> str:
        t0 = time.monotonic()
        entry = {"attempt": len(attempts) + 1}
        attempts.append(entry)
        try:
            entry["raw"] = llm(system, user)
            return entry["raw"]
        except Exception as exc:  # noqa: BLE001 — record, then let the gate classify it
            entry["error"] = f"{type(exc).__name__}: {exc}"
            raise
        finally:
            entry["seconds"] = round(time.monotonic() - t0, 1)

    os.makedirs(OUT, exist_ok=True)
    try:
        # gated: a parse that breaks the audit is re-parsed; the last call is the accepted one
        p = audited_parse(text, llm=rec, source=src, use_cache=False, count_tokens=default_token_counter())
    finally:
        for e in attempts:  # keep every attempt's raw, so a rejected parse is never lost
            if "raw" in e:
                with open(os.path.join(OUT, f"{label}.attempt{e['attempt']}.txt"), "w", encoding="utf-8") as fh:
                    fh.write(e["raw"])
        with open(os.path.join(OUT, f"{label}.attempts.json"), "w", encoding="utf-8") as fh:
            json.dump([{k: v for k, v in e.items() if k != "raw"} | {"chars": len(e.get("raw", ""))}
                       for e in attempts], fh, indent=2)
    with open(os.path.join(OUT, label + ".txt"), "w", encoding="utf-8") as fh:
        fh.write(attempts[-1]["raw"])
    secs = ", ".join(f"{e['seconds']}s" for e in attempts)
    return f"  {label:<24} {len(p.steps):>3} steps  {len(attempts[-1]['raw']):>6} chars  calls: {secs}"


if __name__ == "__main__":
    names = sys.argv[1:]
    if not names:
        raise SystemExit(__doc__)
    with ThreadPoolExecutor(max_workers=4) as ex:
        for line in ex.map(run, names):
            print(line, flush=True)
    print("done")
