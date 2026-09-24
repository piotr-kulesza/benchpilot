"""Output trims that must not change what the player gets.

Trim 1 — the model omits empty fields (null, [], {}, false, ""): the schema fills the
defaults, so a parse with every empty field stripped normalises to EXACTLY the same
Protocol as the full parse. Proven on all ten real fresh parses. `conditions` is the one
exception the prompt keeps: it is always emitted (possibly as {}), because inside it an
absent field would mean "not stated" and send the player back to the text regex, while a
stated false must stay false.
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from core.parse import SYSTEM_PROMPT, parse_protocol  # noqa: E402
from core.schema import StepConditions  # noqa: E402

FRESH = os.path.join(ROOT, "tests", "fixtures", "fresh_parse")
COMPLETE = sorted(f for f in os.listdir(FRESH) if f.endswith(".txt") and not f.endswith(".RAW.txt"))
EMPTY = (None, [], {}, False, "")


def strip_empty(o, keep=("conditions",)):
    """What the trimmed prompt asks the model to emit: every empty field omitted, except
    `conditions`, which stays (its own empty fields are omitted inside it)."""
    if isinstance(o, dict):
        return {k: strip_empty(v) for k, v in o.items() if k in keep or v not in EMPTY}
    if isinstance(o, list):
        return [strip_empty(x) for x in o]
    return o


def test_ten_real_parses_round_trip_with_empty_fields_omitted():
    assert len(COMPLETE) == 10
    for f in COMPLETE:
        raw = open(os.path.join(FRESH, f), encoding="utf-8").read()
        full = parse_protocol("x", llm=lambda s, u, r=raw: r, use_cache=False).to_dict()
        slim_raw = json.dumps(strip_empty(json.loads(raw)), ensure_ascii=False)
        slim = parse_protocol("x", llm=lambda s, u, r=slim_raw: r, use_cache=False).to_dict()
        assert slim == full, f


def test_present_conditions_with_omitted_fields_mean_stated_nothing():
    c = StepConditions.from_dict({})
    assert (c.temperature_c, c.room_temperature, c.on_ice, c.agitation, c.instruments) == (None, False, False, False, [])
    c = StepConditions.from_dict({"temperature_c": 37, "agitation": True})
    assert (c.room_temperature, c.on_ice, c.agitation, c.instruments) == (False, False, True, [])


def test_absent_conditions_still_means_not_stated():
    assert StepConditions.from_dict(None) is None


def test_the_prompt_asks_for_empty_fields_to_be_omitted_but_conditions_kept():
    assert "OMIT EMPTY FIELDS" in SYSTEM_PROMPT
    assert "ALWAYS include `conditions`" in SYSTEM_PROMPT


# Trim 2 — compact JSON (no indentation / line breaks): 87% of the tokens. Whitespace
# carries nothing, so a compact response normalises to the same Protocol.

def test_compact_json_round_trips_on_ten_real_parses():
    for f in COMPLETE:
        raw = open(os.path.join(FRESH, f), encoding="utf-8").read()
        full = parse_protocol("x", llm=lambda s, u, r=raw: r, use_cache=False).to_dict()
        compact = json.dumps(json.loads(raw), ensure_ascii=False, separators=(",", ":"))
        assert parse_protocol("x", llm=lambda s, u, r=compact: r, use_cache=False).to_dict() == full, f


def test_the_prompt_asks_for_compact_json():
    assert "COMPACT JSON" in SYSTEM_PROMPT


# Trim 3 — max_tokens raised to the configured model's ceiling (claude-opus-4-8: 128,000,
# per the Models API). The call streams, and only produced tokens are billed.

def test_the_live_call_asks_for_the_models_full_output_ceiling():
    import inspect
    from core import parse as P
    assert P.MAX_OUTPUT_TOKENS == 128_000
    assert inspect.signature(P.default_llm).parameters["max_tokens"].default == P.MAX_OUTPUT_TOKENS
