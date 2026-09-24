"""The paste path refuses a multi-assay document — a paper's Methods section covering
several separate procedures (cell isolation, culture, an animal model, staining, ELISA,
qPCR, ...) with no single sample thread. The scene follows ONE sample; forcing such a
document into it rendered ~20% of steps as bench and carried a tube through rat surgery.
Detected from the source text, BEFORE any parse call, and rejected by name."""
import glob
import importlib.util
import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from core.ingest import ingest  # noqa: E402
from core.validate import MultiAssayDocument, detect_multi_assay, parse_validated  # noqa: E402

PMC = open(os.path.join(ROOT, "examples", "pmc12207774_methods.txt"), encoding="utf-8").read()


def bundled_sources():
    out = {os.path.basename(p)[:-4]: open(p, encoding="utf-8").read()
           for p in glob.glob(os.path.join(ROOT, "tests", "fixtures", "protocols", "*.txt"))}
    out["neutrophil_rna"] = ingest(os.path.join(ROOT, "examples", "Protokol_ekstrakcji_RNA_neutrofile.docx"))
    out["transformation_example"] = open(os.path.join(ROOT, "examples", "transformation.txt"), encoding="utf-8").read()
    return out


def test_the_real_methods_section_is_detected_with_its_procedures_named():
    d = detect_multi_assay(PMC)
    assert d is not None
    assert "Isolation of endometrial cells" in d["sections"] and "Flow cytometry" in d["sections"]
    assert len(d["sections"]) >= 10


@pytest.mark.parametrize("name", sorted(bundled_sources()))
def test_no_single_protocol_is_flagged(name):
    assert detect_multi_assay(bundled_sources()[name]) is None


def test_sub_numbered_steps_of_one_protocol_are_not_headings():
    one = ("Lysis\n1.1 Add 350 µl RLT buffer to the pellet.\n1.2 Vortex for 1 min.\n"
           "1.3 Centrifuge 3 min at full speed.\n1.4 Transfer the supernatant to a new tube.\n")
    assert detect_multi_assay(one) is None


def test_an_unnumbered_methods_section_is_caught_by_its_markers():
    doc = ("Materials and methods\nCell culture\nHeLa cells were grown in DMEM.\n"
           "Western blotting\nLysates were separated by SDS-PAGE.\n"
           "Statistical analysis\nData are mean ± SD.\n")
    assert detect_multi_assay(doc) is not None


def test_the_paste_gate_refuses_it_before_any_parse_call():
    calls = []
    with pytest.raises(MultiAssayDocument) as e:
        parse_validated(PMC, llm=lambda s, u: calls.append(1) or "{}", source="pasted")
    assert calls == []
    assert "Methods section covering several separate procedures, not one protocol" in str(e.value)


def test_the_api_rejects_it_by_name(monkeypatch):
    pytest.importorskip("fastapi")
    from fastapi import HTTPException
    import core.parse
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    monkeypatch.setattr(core.parse, "default_llm", lambda *a, **k: (lambda s, u: pytest.fail("parse call made")))
    monkeypatch.setattr(core.parse, "default_token_counter", lambda *a, **k: (lambda t: pytest.fail("tokens counted")))
    spec = importlib.util.spec_from_file_location("bp_api_ma", os.path.join(ROOT, "api", "index.py"))
    api = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(api)
    with pytest.raises(HTTPException) as e:
        api.parse_text(api.ParseTextRequest(text=PMC))
    assert e.value.status_code == 422
    assert "looks like a Methods section covering several separate procedures, not one protocol" in e.value.detail
    assert "Isolation of endometrial cells" in e.value.detail
