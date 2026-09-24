"""Parse-time vessel rules — the interpreter for core/vessel_rules.json.

The rules are DATA so that every reader applies the same rules: this module (the parse
gate in scripts/audited_parse.py and the live API in api/index.py / web/api.py) and
web/frontend/scripts/lib/vesselRules.mjs (schema-audit). Both interpreters are held to
tests/fixtures/vessel_rule_cases.json.

`find_vessel_rule_defects` is pure. `load_vessel_rules` reads the rules file that ships
beside this module (package data, like the parse cache — no web / UI knowledge).
"""
from __future__ import annotations

import json
import os
from typing import Any, Optional

from .schema import CONTAINERS

RULES_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vessel_rules.json")


def load_vessel_rules(path: str = RULES_FILE) -> dict:
    with open(path, encoding="utf-8") as fh:
        rules = json.load(fh)
    if not isinstance(rules, dict) or not isinstance(rules.get("rules"), list) or not rules["rules"]:
        raise ValueError(f"{path}: no rules")
    return rules


def _as_list(v: Any) -> list:
    return v if isinstance(v, list) else [v]


def find_vessel_rule_defects(steps: list, rules: dict) -> list[dict]:
    """Every (step, rule) the parse breaks, in step order: [{index, rule, action, container}]."""
    known = set(CONTAINERS)
    out: list[dict] = []
    current = None
    first = True
    for i, s in enumerate(steps or []):
        if not isinstance(s, dict) or s.get("action") == "prepare":
            continue
        idx = s.get("index", i)
        named = s.get("container") if s.get("container") in known else None
        is_first, first = first, False
        for r in rules["rules"]:
            w, req = r.get("when", {}), r.get("require", {})
            if "action" in w and s.get("action") not in _as_list(w["action"]):
                continue
            if w.get("first_sample_step") and not is_first:
                continue
            if "enters" in w and not (named == w["enters"] and current != w["enters"]):
                continue
            ok = True
            if "container" in req:
                ok = named is not None if req["container"] == "named" else named == req["container"]
            if ok and "action" in req:
                ok = s.get("action") in _as_list(req["action"])
            if not ok:
                out.append({"index": idx, "rule": r["id"], "action": s.get("action"), "container": s.get("container")})
        if named:
            current = named
    return out


# ---------------------------------------------------------------------------
# The live paste path's gate. FAIL CLOSED: a parse that cannot be validated is labelled
# "unchecked" (the UI says so) — it is never passed off as validated.
# ---------------------------------------------------------------------------

class ParseFailedValidation(RuntimeError):
    """Every attempt broke a vessel rule; `defects` holds the last attempt's."""

    def __init__(self, defects: list[dict], attempts: int):
        self.defects = defects
        self.attempts = attempts
        rules = ", ".join(sorted({d["rule"] for d in defects}))
        super().__init__(f"parse broke {len(defects)} vessel rule(s) on every one of {attempts} attempts: {rules}")


def validate_protocol(data: dict, rules_path: str = RULES_FILE) -> dict:
    """{"status": "passed"|"failed"|"unchecked", ...} for one parsed protocol dict."""
    try:
        rules = load_vessel_rules(rules_path)
        defects = find_vessel_rule_defects(data.get("steps") or [], rules)
    except Exception as exc:  # noqa: BLE001 — any failure to validate is "unchecked", loudly
        return {"status": "unchecked", "reason": f"vessel rules could not be applied: {exc}", "defects": []}
    return {"status": "failed" if defects else "passed", "defects": defects,
            "rules": [r["id"] for r in rules["rules"]], "rules_version": rules.get("version")}


def parse_validated(text: str, llm=None, source: str = "", attempts: int = 2,
                    rules_path: str = RULES_FILE) -> dict:
    """Parse (never cached), check the vessel rules, re-parse a failing parse.

    Returns the protocol dict with a `validation` block attached: "passed", or
    "unchecked" when the rules could not be applied. Raises ParseFailedValidation when
    every attempt breaks a rule — a failing parse is never returned. OutputTruncated
    propagates at once: the same input truncates again, so it is never retried.
    MalformedOutput (complete but invalid JSON) is retried like a rule failure."""
    from .parse import MalformedOutput, ParseTransportError, parse_protocol  # local import

    last: list[dict] = []
    retryable: Optional[Exception] = None   # malformed output or a dropped stream
    for attempt in range(1, attempts + 1):
        try:
            data = parse_protocol(text, llm=llm, source=source, use_cache=False).to_dict()
        except (MalformedOutput, ParseTransportError) as exc:
            retryable = exc
            continue
        retryable = None
        v = validate_protocol(data, rules_path)
        if v["status"] != "failed":
            v["attempts"] = attempt
            data["validation"] = v
            return data
        last = v["defects"]
    if retryable is not None and not last:
        raise retryable
    raise ParseFailedValidation(last, attempts)
