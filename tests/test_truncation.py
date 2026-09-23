"""A parse whose output hit max_tokens must fail as OUTPUT TRUNCATED — distinctly from
the model producing malformed JSON — and must not be retried (the same input truncates
again) or cached. Evidence: tests/fixtures/fresh_parse/pmc12207774_methods.RAW.txt, a real
response cut off at exactly max_tokens=32000 (74,136 chars, unterminated string)."""
import importlib.util
import os
import sys
from types import SimpleNamespace

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "scripts"))

from core import parse as P  # noqa: E402
from core.parse import MalformedOutput, OutputTruncated, parse_protocol  # noqa: E402

FRESH = os.path.join(ROOT, "tests", "fixtures", "fresh_parse")
TRUNC = open(os.path.join(FRESH, "pmc12207774_methods.RAW.txt"), encoding="utf-8").read()
GOOD = open(os.path.join(FRESH, "neutrophil_rna.txt"), encoding="utf-8").read()
MALFORMED = '{"title": "x", "steps": [ {"index": 1,, "action": "pour_add"} ]}'  # balanced, invalid


def counting(*responses):
    calls = []

    def llm(system, user):
        calls.append(1)
        return responses[min(len(calls), len(responses)) - 1]

    llm.calls = calls
    return llm


def test_the_real_truncated_response_is_output_truncated_not_bad_json():
    with pytest.raises(OutputTruncated):
        parse_protocol("x", llm=lambda s, u: TRUNC, use_cache=False)


def test_balanced_but_invalid_json_is_malformed_not_truncated():
    with pytest.raises(MalformedOutput) as e:
        parse_protocol("x", llm=lambda s, u: MALFORMED, use_cache=False)
    assert not isinstance(e.value, OutputTruncated)


def test_both_are_value_errors_so_existing_handlers_still_catch_them():
    assert issubclass(OutputTruncated, ValueError) and issubclass(MalformedOutput, ValueError)


def test_stop_reason_max_tokens_raises_truncated():
    final = SimpleNamespace(stop_reason="max_tokens", usage=SimpleNamespace(output_tokens=32000))
    with pytest.raises(OutputTruncated) as e:
        P._raise_on_stop(final, max_tokens=32000, text="{...")
    assert e.value.output_tokens == 32000 and e.value.max_tokens == 32000
    P._raise_on_stop(SimpleNamespace(stop_reason="end_turn", usage=None), max_tokens=32000, text="{}")  # no raise


def test_a_truncated_output_is_never_cached(tmp_path, monkeypatch):
    monkeypatch.setattr(P, "_CACHE_DIR", str(tmp_path))
    with pytest.raises(OutputTruncated):
        parse_protocol("some protocol", llm=lambda s, u: TRUNC, use_cache=True)
    assert list(tmp_path.iterdir()) == []


def test_parse_validated_does_not_retry_a_truncation():
    from core.validate import parse_validated
    llm = counting(TRUNC)
    with pytest.raises(OutputTruncated):
        parse_validated("x", llm=llm, source="pasted", attempts=3)
    assert len(llm.calls) == 1


def test_parse_validated_retries_malformed_output():
    from core.validate import parse_validated
    llm = counting(MALFORMED, GOOD)
    d = parse_validated("x", llm=llm, source="pasted", attempts=2)
    assert len(llm.calls) == 2 and d["validation"]["status"] == "passed"


@pytest.mark.skipif(importlib.util.find_spec("node") is None and not __import__("shutil").which("node"),
                    reason="the bundle gate runs schema-audit.mjs under node")
def test_the_bundle_gate_does_not_retry_a_truncation():
    from audited_parse import audited_parse
    llm = counting(TRUNC)
    with pytest.raises(OutputTruncated):
        audited_parse("x", llm=llm, source="t", use_cache=False, log=lambda *_: None)
    assert len(llm.calls) == 1

# (the /api/parse 413 path is covered in tests/test_api_gate.py)
