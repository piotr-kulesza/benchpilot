"""The parse gate: a parse that breaks a parse invariant is rejected and re-parsed,
never returned. Uses the two real Neutrophil fixtures from one prompt: run 2 put the
eluate tube on the "add water" step (rejected), run 1 did not (accepted).

Runs the real web/frontend/scripts/schema-audit.mjs, so it needs `node`; skipped
without it.
"""
import os
import shutil
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "scripts"))

from audited_parse import ParseRejected, audit, audited_parse  # noqa: E402

pytestmark = pytest.mark.skipif(shutil.which("node") is None, reason="needs node for schema-audit.mjs")

FRESH = os.path.join(ROOT, "tests", "fixtures", "fresh_parse")
RUN1 = open(os.path.join(FRESH, "neutrophil_rna.txt"), encoding="utf-8").read()
RUN2 = open(os.path.join(FRESH, "neutrophil_rna__run2.txt"), encoding="utf-8").read()


def scripted(*responses):
    """A fake llm that returns the given raw responses in order, counting calls."""
    calls = []

    def llm(system, user):
        calls.append(1)
        return responses[min(len(calls), len(responses)) - 1]

    llm.calls = calls
    return llm


def test_audit_flags_run2_and_passes_run1():
    from core.parse import parse_protocol
    bad = parse_protocol("x", llm=lambda s, u: RUN2, use_cache=False).to_dict()
    good = parse_protocol("x", llm=lambda s, u: RUN1, use_cache=False).to_dict()
    assert any("eluate-tube-entered-only-by-elute" in d for d in audit(bad))
    assert audit(good) == []


def test_a_rejected_parse_is_reparsed_and_the_good_one_returned():
    llm = scripted(RUN2, RUN1)
    log = []
    p = audited_parse("x", llm=llm, source="t", use_cache=False, log=log.append)
    assert len(llm.calls) == 2                         # rejected once, re-parsed once
    assert any("REJECTED" in line for line in log)     # loudly
    assert [s.container for s in p.steps if s.index == 22] == [None]   # run 1's step 22


def test_a_parse_that_never_passes_fails_instead_of_being_returned():
    llm = scripted(RUN2)
    with pytest.raises(ParseRejected) as e:
        audited_parse("x", llm=llm, source="t", use_cache=False, attempts=2, log=lambda *_: None)
    assert len(llm.calls) == 2
    assert "eluate-tube-entered-only-by-elute" in str(e.value)
