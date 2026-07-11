"""Offline 8-protocol coverage harness (Stage 7).

Re-parses the COMMITTED cached LLM responses (tests/fixtures/cache/*.txt) through the
real core.parse pipeline with a fake llm — no network, no ANTHROPIC_API_KEY. Guards
that the generalized vocabulary + container model actually land: a bounded generic
rate, and that each technique's key operation maps to its intended verb.

Regenerate the cache with:  python tests/fixtures/seed_cache.py
"""
from __future__ import annotations
import os
from collections import Counter

import pytest

from core.parse import parse_protocol

FIX = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")
CACHE_DIR = os.path.join(FIX, "cache")
PROTO_DIR = os.path.join(FIX, "protocols")
NAMES = ["transformation", "pcr", "western", "passaging", "elisa",
         "agarose_gel", "cryopreservation", "gram_stain"]

_have_cache = all(os.path.exists(os.path.join(CACHE_DIR, n + ".txt")) for n in NAMES)
pytestmark = pytest.mark.skipif(
    not _have_cache, reason="run tests/fixtures/seed_cache.py once (needs ANTHROPIC_API_KEY)")


def _parse(name):
    text = open(os.path.join(PROTO_DIR, name + ".txt"), encoding="utf-8").read()
    raw = open(os.path.join(CACHE_DIR, name + ".txt"), encoding="utf-8").read()
    return parse_protocol(text, llm=lambda system, user: raw, source=name + ".txt", use_cache=False)


def _all_actions(proto):
    out = []
    for s in proto.steps:
        out.append(s.action)
        out.extend(a.action for a in s.alternatives)
    return out


@pytest.fixture(scope="module")
def parsed():
    return {n: _parse(n) for n in NAMES}


def test_generic_rate_under_5pct(parsed):
    total = sum(len(p.steps) for p in parsed.values())
    generic = sum(1 for p in parsed.values() for s in p.steps if s.action == "generic")
    rate = 100 * generic / max(total, 1)
    detail = {n: Counter(s.action for s in p.steps).get("generic", 0) for n, p in parsed.items()}
    assert rate <= 5.0, f"generic rate {rate:.1f}% > 5% ({generic}/{total}); per-protocol generic: {detail}"


def test_pcr_is_one_thermocycle_with_cycle_count(parsed):
    tc = [s for s in parsed["pcr"].steps if s.action == "thermocycle"]
    assert len(tc) == 1, f"PCR should have exactly ONE thermocycle step, got {len(tc)}"
    count = tc[0].repeat.count if tc[0].repeat else None
    assert count and 20 <= count <= 45, f"thermocycle repeat.count should be the cycle number, got {count}"


def test_gel_runs_are_electrophorese(parsed):
    assert "electrophorese" in _all_actions(parsed["agarose_gel"]), "agarose gel run should be electrophorese"
    # Western includes a gel run and/or an electro-transfer to the membrane
    assert "electrophorese" in _all_actions(parsed["western"]), "Western gel/transfer should be electrophorese"


def test_seed_on_agar_and_flasks(parsed):
    assert "seed" in _all_actions(parsed["transformation"]), "spreading on agar should be seed"
    assert "seed" in _all_actions(parsed["passaging"]), "seeding new flasks should be seed"


def test_store_for_cold_holding(parsed):
    assert "store" in _all_actions(parsed["cryopreservation"]), "-80/LN2 freezing should be store"


def test_gram_flood_is_stain(parsed):
    assert "stain" in _all_actions(parsed["gram_stain"]), "Gram flood should be stain"


@pytest.mark.parametrize("name", ["western", "elisa"])
def test_non_spin_washes_decompose_to_add_then_discard(parsed, name):
    actions = [s.action for s in parsed[name].steps]
    # a wash-heavy protocol must both ADD buffer and REMOVE it (never endlessly fill)
    assert "pour_add" in actions and "discard" in actions, \
        f"{name} washes should decompose to pour_add + discard, got {Counter(actions)}"
    assert "wash" not in actions, f"{name} still has a bare 'wash' action"


def test_containers_are_parsed_beyond_microtube(parsed):
    # the sample-follow model should pick up non-tube vessels across the sweep
    seen = set()
    for p in parsed.values():
        for s in p.steps:
            if s.container:
                seen.add(s.container)
    non_tube = seen - {"microtube", "tube"}
    assert non_tube, f"expected plate/gel/flask/etc. containers to be parsed, saw only {seen}"
