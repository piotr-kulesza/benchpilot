"""Merge FRESH-parse step conditions into the BUNDLED protocols — and measure drift.

The bundled parses are frozen: re-parsing would change step counts, actions and
containers, so "the player's behaviour did not change" could not be checked. Instead,
each bundled step is matched to a step of a fresh parse (tests/fixtures/fresh_parse/)
by its verbatim source sentence, and ONLY that step's `conditions` are carried over,
into a sidecar tests/fixtures/conditions/<id>.json that gen_examples.py applies. Every
other field stays byte-identical.

The same matching also measures DRIFT between the bundled parse and the fresh one: the
step-count delta and every action / container that changed on a matched step, plus the
steps each side has that the other does not.

    python scripts/condition_merge.py sidecars          # write the sidecars (+ match report)
    python scripts/condition_merge.py drift             # old bundled vs fresh, per protocol
    python scripts/condition_merge.py stability A B     # two fresh parses of one protocol
"""
from __future__ import annotations

import difflib
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from core.parse import parse_protocol  # noqa: E402

FIX = os.path.join(ROOT, "tests", "fixtures")
FRESH = os.path.join(FIX, "fresh_parse")
SIDECARS = os.path.join(FIX, "conditions")
PUBLIC = os.path.join(ROOT, "web", "frontend", "public")
IDS = ["neutrophil_rna", "transformation", "pcr", "western", "passaging", "elisa",
       "agarose_gel", "cryopreservation", "gram_stain"]


def bundled(pid: str) -> dict:
    if pid == "neutrophil_rna":
        return json.load(open(os.path.join(PUBLIC, "parsed.json"), encoding="utf-8"))
    return json.load(open(os.path.join(PUBLIC, "protocols", pid + ".json"), encoding="utf-8"))


def fresh(label: str) -> dict:
    """A fresh raw response run through the SAME pipeline the bundle was built with."""
    raw = open(os.path.join(FRESH, label + ".txt"), encoding="utf-8").read()
    return parse_protocol("", llm=lambda s, u, _r=raw: _r, source=label, use_cache=False).to_dict()


_ws = re.compile(r"\s+")


def _norm(s: str | None) -> str:
    return _ws.sub(" ", (s or "").strip().lower())


def _sim(a: str | None, b: str | None) -> float:
    return difflib.SequenceMatcher(None, _norm(a), _norm(b)).ratio()


def match(old: list[dict], new: list[dict]) -> list[tuple[int, int]]:
    """Pair old steps with new steps (positions in each list), one-to-one.

    A step's `verbatim` is its source sentence, copied onto every step split from it, so
    it pins the SENTENCE; within a sentence, the same action and the closest English
    text pick the step. Pairs are assigned greedily by score, best first."""
    cands = []
    for i, o in enumerate(old):
        for j, n in enumerate(new):
            v = _sim(o.get("verbatim"), n.get("verbatim"))
            if v < 0.85:
                continue
            t = _sim(o.get("text_en") or o.get("text"), n.get("text_en") or n.get("text"))
            same_action = 1.0 if o.get("action") == n.get("action") else 0.0
            # repeated identical steps (ELISA's washes) tie on everything else — prefer
            # the one at the same relative position so they pair in order
            pos = abs(i / max(1, len(old) - 1) - j / max(1, len(new) - 1))
            score = v + 0.6 * same_action + t - 0.3 * pos
            if t >= 0.5 or same_action:
                cands.append((score, i, j))
    cands.sort(reverse=True)
    used_o, used_n, pairs = set(), set(), []
    for _, i, j in cands:
        if i in used_o or j in used_n:
            continue
        used_o.add(i); used_n.add(j); pairs.append((i, j))
    return sorted(pairs)


def _alt_conditions(o: dict, n: dict) -> dict:
    """Carry alternatives' conditions over by position when the method lists line up."""
    out = {}
    oa, na = o.get("alternatives") or [], n.get("alternatives") or []
    if len(oa) == len(na):
        for k, (x, y) in enumerate(zip(oa, na)):
            if y.get("conditions") is not None:
                out[str(k)] = y["conditions"]
    return out


def write_sidecars() -> None:
    os.makedirs(SIDECARS, exist_ok=True)
    print(f"{'protocol':<18} {'bundled':>7} {'fresh':>6} {'matched':>8}  unmatched bundled steps")
    for pid in IDS:
        o, n = bundled(pid)["steps"], fresh(pid)["steps"]
        pairs = match(o, n)
        side = {"source": f"tests/fixtures/fresh_parse/{pid}.txt", "steps": {}}
        for i, j in pairs:
            entry = {"conditions": n[j].get("conditions")}
            alts = _alt_conditions(o[i], n[j])
            if alts:
                entry["alternatives"] = alts
            side["steps"][str(o[i]["index"])] = entry
        with open(os.path.join(SIDECARS, pid + ".json"), "w", encoding="utf-8") as fh:
            json.dump(side, fh, ensure_ascii=False, indent=2)
        miss = [o[i]["index"] for i in range(len(o)) if i not in {p[0] for p in pairs}]
        print(f"{pid:<18} {len(o):>7} {len(n):>6} {len(pairs):>8}  {miss}")


def apply_sidecar(data: dict, pid: str) -> dict:
    """Set `conditions` on each bundled step from its sidecar (in place). Pure apart
    from the read; a step with no entry keeps conditions = None (player reads text)."""
    path = os.path.join(SIDECARS, pid + ".json")
    if not os.path.exists(path):
        return data
    steps = json.load(open(path, encoding="utf-8"))["steps"]
    for s in data.get("steps", []):
        e = steps.get(str(s.get("index")))
        s["conditions"] = e["conditions"] if e else None
        for k, a in enumerate(s.get("alternatives") or []):
            a["conditions"] = (e or {}).get("alternatives", {}).get(str(k))
    return data


def diff(old: list[dict], new: list[dict], a_name: str, b_name: str) -> dict:
    pairs = match(old, new)
    mo, mn = {i for i, _ in pairs}, {j for _, j in pairs}
    changed = []
    for i, j in pairs:
        o, n = old[i], new[j]
        for f in ("action", "container"):
            if o.get(f) != n.get(f):
                changed.append((o["index"], n["index"], f, o.get(f), n.get(f), (o.get("text_en") or o.get("text") or "")[:70]))
    only_a = [(old[i]["index"], old[i].get("action"), old[i].get("container"), (old[i].get("text_en") or "")[:70]) for i in range(len(old)) if i not in mo]
    only_b = [(new[j]["index"], new[j].get("action"), new[j].get("container"), (new[j].get("text_en") or "")[:70]) for j in range(len(new)) if j not in mn]
    return {"a": a_name, "b": b_name, "n_a": len(old), "n_b": len(new), "matched": len(pairs),
            "changed": changed, "only_a": only_a, "only_b": only_b}


def print_diff(d: dict) -> None:
    print(f"\n## {d['a']} -> {d['b']}: {d['n_a']} -> {d['n_b']} steps (delta {d['n_b'] - d['n_a']:+d}), {d['matched']} matched")
    for oi, ni, f, a, b, t in d["changed"]:
        print(f"   ~ step {oi}->{ni} {f}: {a} -> {b}   | {t}")
    for idx, act, cont, t in d["only_a"]:
        print(f"   - only in {d['a']}: step {idx} {act} {cont or ''}  | {t}")
    for idx, act, cont, t in d["only_b"]:
        print(f"   + only in {d['b']}: step {idx} {act} {cont or ''}  | {t}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "sidecars"
    if cmd == "sidecars":
        write_sidecars()
    elif cmd == "drift":
        for pid in IDS:
            print_diff(diff(bundled(pid)["steps"], fresh(pid)["steps"], f"{pid} bundled", "fresh"))
    elif cmd == "stability":
        a, b = sys.argv[2], sys.argv[3]
        print_diff(diff(fresh(a)["steps"], fresh(b)["steps"], a, b))
    else:
        raise SystemExit(__doc__)
