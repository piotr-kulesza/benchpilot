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
