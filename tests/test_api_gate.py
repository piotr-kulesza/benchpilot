"""The deployed paste path (api/index.py) is gated: a parse that breaks a vessel rule is
re-parsed; one that never validates is a 422, never shown; one that cannot be validated
is returned labelled "unchecked"; a truncated parse is a 413, never retried.

Calls the endpoint functions directly (FastAPI endpoints are plain functions), so no HTTP
test client is needed — anthropic 1.x ships httpx2, and starlette's TestClient wants httpx."""
import importlib.util
import os
import sys

import pytest

pytest.importorskip("fastapi")
from fastapi import HTTPException  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
FRESH = os.path.join(ROOT, "tests", "fixtures", "fresh_parse")
RUN1 = open(os.path.join(FRESH, "neutrophil_rna.txt"), encoding="utf-8").read()
RUN2 = open(os.path.join(FRESH, "neutrophil_rna__run2.txt"), encoding="utf-8").read()
TRUNC = open(os.path.join(FRESH, "pmc12207774_methods.RAW.txt"), encoding="utf-8").read()


@pytest.fixture()
def api(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    import core.parse
    responses, calls = [], []

    def fake_default_llm(*a, **k):
        def llm(system, user):
            calls.append(1)
            return responses[min(len(calls), len(responses)) - 1]
        return llm

    monkeypatch.setattr(core.parse, "default_llm", fake_default_llm)
    # the live path pre-flights with the token counter; stub it (offline tests never call out)
    monkeypatch.setattr(core.parse, "default_token_counter", lambda *a, **k: (lambda text: 1_000))
    # load the deployed entrypoint by path (api/ has no __init__.py — keep the deploy dir clean)
    spec = importlib.util.spec_from_file_location("benchpilot_api_index", os.path.join(ROOT, "api", "index.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.responses, mod.calls = responses, calls
    return mod


def post(api, text="a protocol"):
    return api.parse_text(api.ParseTextRequest(text=text))


def test_a_failing_parse_is_reparsed_and_the_good_one_served(api):
    api.responses[:] = [RUN2, RUN1]
    d = post(api)
    assert d["validation"]["status"] == "passed" and d["validation"]["attempts"] == 2


def test_a_parse_that_never_validates_is_a_422_not_a_run(api):
    api.responses[:] = [RUN2]
    with pytest.raises(HTTPException) as e:
        post(api)
    assert e.value.status_code == 422
    assert "eluate-tube-entered-only-by-elute" in e.value.detail


def test_a_parse_that_cannot_be_validated_is_labelled_unchecked(api, monkeypatch):
    import core.validate

    def boom(*a, **k):
        raise OSError("rules file missing")

    monkeypatch.setattr(core.validate, "load_vessel_rules", boom)
    api.responses[:] = [RUN1]
    d = post(api)
    assert d["validation"]["status"] == "unchecked" and "rules file missing" in d["validation"]["reason"]


def test_a_truncated_parse_is_a_413_after_one_call_not_a_rules_422(api):
    api.responses[:] = [TRUNC]
    with pytest.raises(HTTPException) as e:
        post(api, "a long protocol")
    assert e.value.status_code == 413
    assert "truncated" in e.value.detail.lower() and "rule" not in e.value.detail.lower()
    assert len(api.calls) == 1
