# benchpilot

**Thesis.** Paste any messy lab protocol → get a runnable, timed, gap-flagged
guide. The incumbent (protocols.io) requires manual authoring and renders
plain-text. Our wedge is **instant Claude ingestion + a beautiful, runnable
experience**: durations become timers, conditionals become branches,
either/or steps become choices, hazards (including *negatives* like "do NOT
centrifuge") are surfaced, and every underspecified value becomes an open
question you answer before running.

## Current status: parse-fidelity spike

We are proving ONE risky thing before building anything pretty: **can Claude
turn a real, messy protocol into a correct, structured, RUNNABLE
representation?** Judge fidelity in `outputs/parsed_preview.html` against
`docs/spike_targets.md`. If it holds → build the player. If not → ship the
geo-harmonizer fallback.

Demo protocol: `examples/Protokol_ekstrakcji_RNA_neutrofile.docx` (Polish RNA
extraction; do NOT translate — parse in place).

## Iron rule (non-negotiable)

The parse core is **pure and interface-agnostic**. `parse_protocol(text, llm)`
takes protocol text + an injectable `llm(system, user) -> str` and returns
structured data (`core/schema.py`). **Zero web/UI/file knowledge in `core/`.**
This is what let the parser be tested offline and reused behind any interface.

- **One batched call.** The whole protocol is parsed in a SINGLE llm call, never
  per-step. The raw response is cached by a hash of the input, so re-runs don't
  re-spend.
- Heavy/docx libs are **lazy-imported**. Needs `ANTHROPIC_API_KEY` for a live
  run (cached runs and the offline test need nothing).
- **Commit per change.**

## Layout

- `core/schema.py` — dataclasses; the intellectual core (Protocol, Step, …).
- `core/ingest.py` — .docx / .txt / pasted-string → plain text (lazy imports).
- `core/parse.py` — the single cached llm call + system prompt (parse fidelity).
- `scripts/parse_check.py` — run parse, write `outputs/parsed.json` + preview.
- `tests/test_parse.py` — one offline test (fake llm, canned JSON).
- `docs/spike_targets.md` — the fidelity checklist to judge against.

## Run

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export ANTHROPIC_API_KEY=...
python scripts/parse_check.py            # parses examples/*.docx
open outputs/parsed_preview.html
pytest -q                                # offline; no key needed
```
