"""The deployed paste path (api/index.py) is gated: a parse that breaks a vessel rule is
re-parsed; one that never validates is a 422, never shown; one that cannot be validated
is returned labelled "unchecked". Skipped without fastapi's test client."""
import importlib
import importlib.util
import os
import sys

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")
from fastapi.testclient import TestClient  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
FRESH = os.path.join(ROOT, "tests", "fixtures", "fresh_parse")
RUN1 = open(os.path.join(FRESH, "neutrophil_rna.txt"), encoding="utf-8").read()
RUN2 = open(os.path.join(FRESH, "neutrophil_rna__run2.txt"), encoding="utf-8").read()


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    import core.parse
    responses = []
    monkeypatch.setattr(core.parse, "default_llm", lambda *a, **k: (lambda s, u: responses.pop(0) if len(responses) > 1 else responses[0]))
    # load the deployed entrypoint by path (api/ has no __init__.py — keep the deploy dir clean)
    spec = importlib.util.spec_from_file_location("benchpilot_api_index", os.path.join(ROOT, "api", "index.py"))
    api = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(api)
    c = TestClient(api.app)
    c.responses = responses
    return c


def test_a_failing_parse_is_reparsed_and_the_good_one_served(client):
    client.responses[:] = [RUN2, RUN1]
    r = client.post("/api/parse", json={"text": "a protocol"})
    assert r.status_code == 200
    assert r.json()["validation"]["status"] == "passed"
    assert r.json()["validation"]["attempts"] == 2


def test_a_parse_that_never_validates_is_a_422_not_a_run(client):
    client.responses[:] = [RUN2]
    r = client.post("/api/parse", json={"text": "a protocol"})
    assert r.status_code == 422
    assert "eluate-tube-entered-only-by-elute" in r.json()["detail"]


def test_a_parse_that_cannot_be_validated_is_labelled_unchecked(client, monkeypatch):
    import core.validate
    def boom(*a, **k):
        raise OSError("rules file missing")
    monkeypatch.setattr(core.validate, "load_vessel_rules", boom)
    client.responses[:] = [RUN1]
    r = client.post("/api/parse", json={"text": "a protocol"})
    assert r.status_code == 200
    assert r.json()["validation"]["status"] == "unchecked"
    assert "rules file missing" in r.json()["validation"]["reason"]
