"""Generate the bundled, PRE-PARSED example protocols for the home page.

Offline: re-parses the committed Stage-7 cache (raw LLM responses) through the real
core.parse pipeline — no network, no ANTHROPIC_API_KEY — and writes one parsed.json per
example into web/frontend/public/protocols/, plus an index.json the home page reads.
The neutrophil RNA example is the already-bundled, hand-tuned public/parsed.json.

    python scripts/gen_examples.py
"""
from __future__ import annotations
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from core.parse import parse_protocol  # noqa: E402
from core.schema import ACTIONS  # noqa: E402

FIX = os.path.join(ROOT, "tests", "fixtures")
OUT = os.path.join(ROOT, "web", "frontend", "public", "protocols")
RNA_SRC = os.path.join(ROOT, "web", "frontend", "public", "parsed.json")

# id -> display metadata; `file` is <id>.json. Order = home-page order (RNA first = hero).
META = [
    ("neutrophil_rna",  "Neutrophil RNA extraction", "RNA extraction",  "spin column · NanoDrop"),
    ("transformation",  "Bacterial transformation",  "Cloning",         "agar plate · spreader"),
    ("pcr",             "Standard PCR",              "Amplification",   "thermocycler"),
    ("western",         "Western blot",              "Protein",         "gel rig · membrane"),
    ("passaging",       "Adherent-cell passaging",   "Cell culture",    "flask · aspirate"),
    ("elisa",           "Sandwich ELISA",            "Immunoassay",     "96-well plate · reader"),
    ("agarose_gel",     "Agarose DNA gel",           "Electrophoresis", "gel tank · bands"),
    ("cryopreservation","Cryopreservation",          "Cell storage",    "cryovial · freezer"),
    ("gram_stain",      "Gram stain",                "Microscopy",      "glass slide · dye"),
]
PROSE = {"generic"}


def actionable(s: dict) -> bool:
    if (s.get("phase")) == "notes":
        return False
    # a DO-AHEAD preparation is lifted into the intake checklist, not a 3D station —
    # mirror the frontend's isActionableStep so the home-page count matches the run.
    if s.get("prep_ahead"):
        return False
    a = s.get("action") or "generic"
    if a not in PROSE:
        return True
    return bool(s.get("reagents")) or bool(s.get("spin")) or bool(s.get("duration_seconds"))


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    index = []
    for pid, name, technique, highlight in META:
        if pid == "neutrophil_rna":
            d = json.load(open(RNA_SRC, encoding="utf-8"))
        else:
            text = open(os.path.join(FIX, "protocols", pid + ".txt"), encoding="utf-8").read()
            raw = open(os.path.join(FIX, "cache", pid + ".txt"), encoding="utf-8").read()
            d = parse_protocol(text, llm=lambda s, u, _r=raw: _r, source=pid + ".txt", use_cache=False).to_dict()
        with open(os.path.join(OUT, pid + ".json"), "w", encoding="utf-8") as fh:
            json.dump(d, fh, ensure_ascii=False, indent=2)
        stations = [s for s in d["steps"] if actionable(s)]
        # a live highlight for PCR: show the real cycle count
        hi = highlight
        for s in d["steps"]:
            if s.get("action") == "thermocycle" and (s.get("repeat") or {}).get("count"):
                hi = f"thermocycler · {s['repeat']['count']} cycles"
        index.append({"id": pid, "file": pid + ".json", "name": name,
                      "technique": technique, "steps": len(stations), "highlight": hi})
        print(f"{pid:<18} {len(stations):>2} stations -> protocols/{pid}.json")
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as fh:
        json.dump(index, fh, ensure_ascii=False, indent=2)
    print(f"wrote index.json ({len(index)} examples)")


if __name__ == "__main__":
    main()
