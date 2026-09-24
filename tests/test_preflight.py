"""Pre-flight: before a live parse can cost money, count the input tokens, predict the
output, and refuse a protocol whose predicted output exceeds the budget — with no parse
call made. Calibrated on the ten real fresh parses (trimmed output / source tokens:
3.7-9.3); truncation detection stays as the backstop for a misprediction."""
import importlib.util
import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "scripts"))

from core import parse as P  # noqa: E402
from core.parse import ProtocolTooLong, estimate_output_tokens, parse_protocol  # noqa: E402

GOOD = open(os.path.join(ROOT, "tests", "fixtures", "fresh_parse", "neutrophil_rna.txt"), encoding="utf-8").read()


def counting_llm():
    calls = []

    def llm(s, u):
        calls.append(1)
        return GOOD

    llm.calls = calls
    return llm


def test_the_estimate_is_conservative_against_every_calibration_parse():
    # (source tokens, trimmed output tokens) measured on the ten fresh parses
    for src, out in [(520, 2978), (439, 2458), (609, 5639), (406, 2601), (2810, 10514),
                     (2810, 10432), (608, 4195), (418, 3375), (583, 3386), (685, 4603)]:
        assert estimate_output_tokens(src) >= out


def test_a_protocol_predicted_too_long_is_refused_before_any_parse_call():
    llm = counting_llm()
    with pytest.raises(ProtocolTooLong) as e:
        parse_protocol("x", llm=llm, use_cache=False, count_tokens=lambda t: 50_000)
    assert llm.calls == []                        # nothing spent on a parse
    assert e.value.predicted_output > e.value.budget and e.value.input_tokens == 50_000
    assert "too long" in str(e.value).lower()


def test_a_protocol_within_budget_is_parsed():
    llm = counting_llm()
    parse_protocol("x", llm=llm, use_cache=False, count_tokens=lambda t: 3_000)
    assert llm.calls == [1]


def test_a_cache_hit_needs_no_preflight(tmp_path, monkeypatch):
    monkeypatch.setattr(P, "_CACHE_DIR", str(tmp_path))
    parse_protocol("cached protocol", llm=lambda s, u: GOOD, use_cache=True)   # fills the cache
    counted = []
    parse_protocol("cached protocol", llm=lambda s, u: GOOD, use_cache=True,
                   count_tokens=lambda t: counted.append(t) or 10**9)          # would be "too long"
    assert counted == []                           # free path: never counted, never refused


def test_the_live_path_preflights_by_default(monkeypatch):
    seen = []
    monkeypatch.setattr(P, "default_token_counter", lambda *a, **k: (lambda t: seen.append(t) or 50_000))
    monkeypatch.setattr(P, "default_llm", lambda *a, **k: (lambda s, u: pytest.fail("parse call made")))
    with pytest.raises(ProtocolTooLong):
        parse_protocol("a long protocol", use_cache=False)       # llm=None -> live path
    assert seen == ["a long protocol"]


def test_the_bundle_gate_does_not_retry_a_protocol_too_long():
    from audited_parse import audited_parse
    llm = counting_llm()
    with pytest.raises(ProtocolTooLong):
        audited_parse("x", llm=llm, source="t", use_cache=False, count_tokens=lambda t: 50_000, log=lambda *_: None)
    assert llm.calls == []


def test_the_api_refuses_before_spending(monkeypatch):
    pytest.importorskip("fastapi")
    from fastapi import HTTPException
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    monkeypatch.setattr(P, "default_token_counter", lambda *a, **k: (lambda t: 50_000))
    monkeypatch.setattr(P, "default_llm", lambda *a, **k: (lambda s, u: pytest.fail("parse call made")))
    spec = importlib.util.spec_from_file_location("bp_api_pf", os.path.join(ROOT, "api", "index.py"))
    api = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(api)
    with pytest.raises(HTTPException) as e:
        api.parse_text(api.ParseTextRequest(text="a very long protocol"))
    assert e.value.status_code == 413
    d = e.value.detail.lower()
    assert "too long" in d and "not charged" in d and "rule" not in d
