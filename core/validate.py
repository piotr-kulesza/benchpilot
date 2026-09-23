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
from typing import Any

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
