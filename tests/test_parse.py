"""One offline test: fake llm + tiny synthetic protocol.

Keeps `core` importable and correct without a network / API key. Asserts the
schema populates and that a conditional, an either/or alternative, and a TBD gap
are each represented.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.parse import parse_protocol  # noqa: E402
from core.schema import Protocol       # noqa: E402


SYNTHETIC = """\
Test protocol.
1. Add 350 µl buffer for ≤ 5 million cells, else 600 µl.
2. Homogenize with QIAshredder 2 min OR pass 5× through a needle.
3. Do NOT centrifuge.
4. Elute; target RIN to be determined on site.
"""

CANNED_JSON = json.dumps({
    "title": "Test protocol",
    "summary": "A tiny synthetic protocol.",
    "source": "synthetic",
    "materials": [{"name": "buffer", "note": None}],
    "steps": [
        {
            "index": 1, "phase": "procedure", "kind": "action",
            "text": "Add lysis buffer.",
            "reagents": [
                {"name": "buffer", "volume": "350 µl", "condition": "≤ 5×10⁶ cells"},
                {"name": "buffer", "volume": "600 µl", "condition": "> 5×10⁶ cells"},
            ],
            "conditionals": [
                {"condition": "≤ 5×10⁶ cells", "then": "use 350 µl"},
                {"condition": "> 5×10⁶ cells", "then": "use 600 µl"},
            ],
            "verbatim": "Add 350 µl buffer for ≤ 5 million cells, else 600 µl.",
        },
        {
            "index": 2, "phase": "procedure", "kind": "action",
            "text": "Homogenize the lysate.",
            "duration_seconds": 120,
            "alternatives": [
                {"kind": "action", "text": "QIAshredder 2 min", "duration_seconds": 120},
                {"kind": "action", "text": "5× through a needle", "repeat": {"count": 5}},
            ],
            "verbatim": "Homogenize with QIAshredder 2 min OR pass 5× through a needle.",
        },
        {
            "index": 3, "phase": "procedure", "kind": "caution",
            "text": "Mix; do not spin.",
            "hazards": ["Do NOT centrifuge"],
            "verbatim": "Do NOT centrifuge.",
        },
        {
            "index": 4, "phase": "procedure", "kind": "action",
            "text": "Elute the RNA.",
            "gaps": [{"parameter": "target RIN", "question": "What is the acceptance RIN?"}],
            "verbatim": "Elute; target RIN to be determined on site.",
        },
    ],
    "open_parameters": [
        {"question": "What is the target RIN?", "where": "step 4 / QC"},
    ],
    "reference": None,
})


def fake_llm(system: str, user: str) -> str:
    assert "STRICT JSON" in system  # the system prompt is actually passed through
    assert "PROTOCOL START" in user and "350 µl" in user  # our text reached it
    return CANNED_JSON


def test_parse_populates_schema():
    p = parse_protocol(SYNTHETIC, llm=fake_llm, source="synthetic", use_cache=False)

    assert isinstance(p, Protocol)
    assert p.title == "Test protocol"
    assert len(p.steps) == 4
    # index is reassigned 1..n by the schema
    assert [s.index for s in p.steps] == [1, 2, 3, 4]


def test_conditional_represented():
    p = parse_protocol(SYNTHETIC, llm=fake_llm, use_cache=False)
    step = p.steps[0]
    assert len(step.conditionals) == 2
    assert step.conditionals[0].condition == "≤ 5×10⁶ cells"
    # conditional reagent volumes preserved untranslated
    vols = {r.volume for r in step.reagents}
    assert "350 µl" in vols and "600 µl" in vols


def test_alternative_represented():
    p = parse_protocol(SYNTHETIC, llm=fake_llm, use_cache=False)
    step = p.steps[1]
    assert len(step.alternatives) == 2
    assert step.alternatives[0].text == "QIAshredder 2 min"
    assert step.alternatives[1].repeat is not None
    assert step.alternatives[1].repeat.count == 5


def test_negative_hazard_and_gap_represented():
    p = parse_protocol(SYNTHETIC, llm=fake_llm, use_cache=False)
    assert p.steps[2].hazards == ["Do NOT centrifuge"]
    gap = p.steps[3].gaps[0]
    assert gap.parameter == "target RIN"
    assert len(p.open_parameters) == 1


def test_normalize_strips_reagent_name_from_hazards():
    from core.parse import normalize_parsed
    data = {
        "materials": [],
        "steps": [{
            "index": 1, "action": "electrophorese", "text": "Transfer at 100 V.",
            "reagents": [{"name": "cold transfer buffer"}],
            "hazards": ["cold transfer buffer", "keep it cold"],
            "hazards_en": ["cold transfer buffer", "keep it cold"],
        }],
    }
    out = normalize_parsed(data)
    s = out["steps"][0]
    # the bare reagent name is dropped; the real caution (aligned _en) survives
    assert s["hazards"] == ["keep it cold"]
    assert s["hazards_en"] == ["keep it cold"]


def test_normalize_reclassifies_drain_measure_to_discard():
    from core.parse import normalize_parsed
    data = {"steps": [
        {"index": 1, "action": "measure", "kind": "measure",
         "text_en": "Drain the membrane of excess developing solution, wrap and expose."},
        {"index": 2, "action": "measure", "kind": "measure",
         "text_en": "Read the absorbance in the plate reader at 450 nm."},
    ]}
    out = normalize_parsed(data)
    assert out["steps"][0]["action"] == "discard" and out["steps"][0]["kind"] == "action"
    assert out["steps"][1]["action"] == "measure"  # a genuine reading is untouched


def test_arrange_moves_just_in_time_prep_before_its_consumer():
    from core.parse import arrange_preparations
    data = {"steps": [
        {"index": 1, "action": "prepare", "produces": "dnase_mix", "prep_ahead": False,
         "text": "Prepare the DNase I mixture"},
        {"index": 2, "action": "pour_add", "text": "Add RLT buffer"},
        {"index": 3, "action": "centrifuge", "text": "Spin"},
        {"index": 4, "action": "pour_add", "draws_from": "dnase_mix",
         "text": "Apply the DNase I mixture onto the column"},
    ]}
    out = arrange_preparations(data)
    texts = [s["text"] for s in out["steps"]]
    # the enzyme mix is made JUST BEFORE it is applied, not up front
    assert texts == ["Add RLT buffer", "Spin",
                     "Prepare the DNase I mixture",
                     "Apply the DNase I mixture onto the column"]
    prep = next(s for s in out["steps"] if s["action"] == "prepare")
    assert prep["source_index"] == 0            # original emitted order is still recoverable
    assert prep["target"] == "dnase_mix"        # a prepare targets its own product
    assert prep["phase"] == "procedure"         # it now lives inside the timed run
    sample_step = next(s for s in out["steps"] if s["action"] == "centrifuge")
    assert sample_step["target"] == "sample"    # everything else defaults to the sample


def test_arrange_leaves_do_ahead_prep_in_place_and_names_products():
    from core.parse import arrange_preparations
    data = {"steps": [
        {"index": 1, "action": "prepare", "prep_ahead": True, "text": "Add 2-ME to RLT"},
        {"index": 2, "action": "pour_add", "text": "Lyse the pellet"},
    ]}
    out = arrange_preparations(data)
    # a do-ahead (shelf-stable) prep is NOT reordered into the run
    assert [s["text"] for s in out["steps"]] == ["Add 2-ME to RLT", "Lyse the pellet"]
    # every prepare names a product even when the model forgot to
    assert out["steps"][0]["produces"]
    assert out["steps"][0]["target"] == out["steps"][0]["produces"]


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print(f"ok  {name}")
    print("all passed")


# ---------------------------------------------------------------------------
# Structured step conditions — the fields the scene's instrument resolver reads
# (web/frontend/src/vessel/sceneRecipe.js stepConditions: temperature_c,
# room_temperature, on_ice, agitation, instruments). Absent -> None, so the player
# falls back to reading the text; present -> the parser's statement wins.
# ---------------------------------------------------------------------------

from core.schema import Step, StepConditions, INSTRUMENTS  # noqa: E402
from core.parse import SYSTEM_PROMPT  # noqa: E402


def test_step_conditions_absent_is_none():
    s = Step.from_dict({"text": "Wait 1 min."})
    assert s.conditions is None
    # and it serialises as null, which the player reads as "fall back to the text"
    from dataclasses import asdict
    assert asdict(s)["conditions"] is None


def test_step_conditions_parse_and_coerce():
    s = Step.from_dict({"text": "Return the cells to the 37°C, 5% CO2 incubator.",
                        "conditions": {"temperature_c": "37", "room_temperature": False,
                                       "on_ice": None, "agitation": "false",
                                       "instruments": ["CO2_Incubator", " ", None]}})
    c = s.conditions
    assert isinstance(c, StepConditions)
    assert c.temperature_c == 37
    assert c.room_temperature is False      # a stated false is a statement
    # inside a PRESENT conditions object an omitted/null field is "stated: nothing" —
    # the model omits empty fields; only an absent object means "fall back to the text"
    assert c.on_ice is False
    assert c.agitation is False             # "false" string coerces to False
    assert c.instruments == ["co2_incubator"]  # lower-cased, blanks dropped


def test_step_conditions_keep_unknown_instruments_verbatim():
    c = StepConditions.from_dict({"instruments": ["sonicator", "nanodrop"]})
    assert c.instruments == ["sonicator", "nanodrop"]


def test_instrument_vocabulary_is_in_the_prompt():
    for name in INSTRUMENTS:
        assert name in SYSTEM_PROMPT, name
    for field in ("temperature_c", "room_temperature", "on_ice", "agitation", "instruments"):
        assert field in SYSTEM_PROMPT, field


# ---------------------------------------------------------------------------
# Vessel rules as DATA (core/vessel_rules.json), read by core/validate.py here and by
# web/frontend/scripts/lib/vesselRules.mjs in the audit. Both must pass the same cases.
# ---------------------------------------------------------------------------

def test_vessel_rule_conformance_cases():
    from core.validate import find_vessel_rule_defects, load_vessel_rules
    rules = load_vessel_rules()
    cases = json.load(open(os.path.join(os.path.dirname(__file__), "fixtures", "vessel_rule_cases.json"),
                           encoding="utf-8"))["cases"]
    for c in cases:
        got = [[d["index"], d["rule"]] for d in find_vessel_rule_defects(c["steps"], rules)]
        assert got == c["expect"], c["name"]


def test_every_vessel_rule_carries_an_honest_evidence_label():
    from core.validate import load_vessel_rules
    for r in load_vessel_rules()["rules"]:
        assert r["evidence"]["kind"] in ("real", "hand-edited-only"), r["id"]
        assert r["evidence"]["detail"], r["id"]


# ---------------------------------------------------------------------------
# The live paste path's gate (api/index.py, web/api.py): parse, check the vessel rules,
# re-parse a failing parse, and label the result — fail CLOSED: a parse that could not be
# validated is labelled "unchecked", never passed off as validated.
# ---------------------------------------------------------------------------

_FRESH = os.path.join(os.path.dirname(__file__), "fixtures", "fresh_parse")
_RUN1 = open(os.path.join(_FRESH, "neutrophil_rna.txt"), encoding="utf-8").read()
_RUN2 = open(os.path.join(_FRESH, "neutrophil_rna__run2.txt"), encoding="utf-8").read()


def _scripted(*responses):
    calls = []

    def llm(system, user):
        calls.append(1)
        return responses[min(len(calls), len(responses)) - 1]

    llm.calls = calls
    return llm


def test_validate_protocol_passed_failed_unchecked():
    from core.validate import validate_protocol
    good = parse_protocol("x", llm=lambda s, u: _RUN1, use_cache=False).to_dict()
    bad = parse_protocol("x", llm=lambda s, u: _RUN2, use_cache=False).to_dict()
    assert validate_protocol(good)["status"] == "passed"
    v = validate_protocol(bad)
    assert v["status"] == "failed" and v["defects"][0]["rule"] == "eluate-tube-entered-only-by-elute"
    # rules that cannot be loaded -> UNCHECKED, with the reason; never "passed"
    u = validate_protocol(good, rules_path="/nonexistent/vessel_rules.json")
    assert u["status"] == "unchecked" and u["reason"]


def test_parse_validated_reparses_a_failing_parse():
    from core.validate import parse_validated
    llm = _scripted(_RUN2, _RUN1)
    d = parse_validated("x", llm=llm, source="pasted")
    assert len(llm.calls) == 2
    assert d["validation"]["status"] == "passed"
    assert d["validation"]["attempts"] == 2


def test_parse_validated_raises_when_every_attempt_fails():
    from core.validate import ParseFailedValidation, parse_validated
    llm = _scripted(_RUN2)
    try:
        parse_validated("x", llm=llm, source="pasted", attempts=2)
    except ParseFailedValidation as e:
        assert len(llm.calls) == 2
        assert e.defects[0]["rule"] == "eluate-tube-entered-only-by-elute"
    else:
        raise AssertionError("a parse that never validates must not be returned")


def test_parse_validated_labels_unchecked_when_it_cannot_validate():
    from core.validate import parse_validated
    d = parse_validated("x", llm=lambda s, u: _RUN1, source="pasted", rules_path="/nonexistent.json")
    assert d["validation"]["status"] == "unchecked"
