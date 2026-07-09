# benchpilot

**Thesis.** Paste any messy lab protocol → get a runnable, timed, gap-flagged
guide. The incumbent (protocols.io) requires manual authoring and renders
plain-text. Our wedge is **instant Claude ingestion + a beautiful, runnable
experience**: durations become timers, conditionals become branches,
either/or steps become choices, hazards (including *negatives* like "do NOT
centrifuge") are surfaced, and every underspecified value becomes an open
question you answer before running.

## Status

1. **Parse-fidelity spike — PROVEN.** All 14 targets in `docs/spike_targets.md`
   parse correctly from the real Polish protocol. Judge in
   `outputs/parsed_preview.html`.
2. **Protocol player — BUILT** (`web/frontend/`). A beautiful, bench-usable
   single-purpose app over the parsed schema: a "before you start" intake
   (open questions + prep-ahead checklist + materials/hazards), then a calm
   one-step-at-a-time runner with timers, resolved conditionals, either/or
   choices, tracked repeats, and prominent hazards (negatives in red). See
   `docs/media/walkthrough.gif`.
3. **Animated + English-first — BUILT.** The step hero is a single beautifully-lit
   **3D glass vessel** (react-three-fiber) that changes STATE per action (pour,
   spin, incubate, heat, cool…) — same glass, same studio light, only its
   behavior changes. The UI defaults to English (`text_en`) with an EN / Original
   toggle. The schema carries a fixed `action` vocabulary + parallel `_en` fields;
   the original language is always kept verbatim.

Demo protocol: `examples/Protokol_ekstrakcji_RNA_neutrofile.docx` (Polish RNA
extraction; do NOT translate — parse in place).

## The player — `web/frontend/` (Vite + React 18)

- Consumes the **schema only** — it does NOT depend on how `parsed.json` was
  produced. Default data source is the bundled `public/parsed.json` (a copy of
  `outputs/parsed.json`), so the demo runs with **zero backend**.
- Pure runtime logic lives in `src/lib/runtime.js` (duration formatting,
  conditional resolution from intake answers, alternative selection, repeat
  counting, hazard classification) — unit-tested offline with Vitest, no DOM /
  network / real timers. Wall-clock lives only in `src/hooks/useCountdown.js`.
- Deep-link a run for demos: `?run=1&step=5&kit=micro&cells=le` (add `&lang=orig`
  to open in the original language).
- **The 3D vessel** lives in `src/vessel/`:
  - `theme.js` — ALL art-direction knobs (glass, liquid, lighting, backdrop,
    bloom, reagent colours) in one place. Tune here.
  - `behavior.js` — pure `action → behavior` descriptor map (`resolveBehavior`;
    unknown → `generic`). This is what the offline test covers — no GPU needed.
  - `Scene.jsx` — the R3F scene: studio `<Environment>` lightformers + gradient
    backdrop, `<MeshTransmissionMaterial>` glass (hollow open-top vial),
    per-reagent liquid, `<ContactShadows>`, `<Float>`, Bloom/Vignette.
  - `Canvas3D.jsx` — the `<Canvas>` wrapper (only module importing three).
  - `index.jsx` — `<Vessel>`: WebGL feature-detect + error boundary → static
    `Fallback.jsx` if unavailable (never blank, never crash). Renders the data
    overlay (reagent · volume, temp, rcf/time) beside the glass.
  - Timed actions (incubate/heat/centrifuge) reflect the runner's countdown via
    `progress`; the number still comes from the timer strip.
  - Deps: `three`, `@react-three/fiber`, `@react-three/drei`,
    `@react-three/postprocessing` (split into a cached `three` vendor chunk).
- **Language**: helpers in `src/lib/runtime.js` (`localize`, `stepText`,
  `reagentName`, `stepHazards`) pick `_en` by default and fall back to the
  original when a translation is missing.
- Optional live-parse stretch: `web/api.py` (FastAPI) exposes `POST /api/parse`
  over the real `core` pipeline. Guarded — its absence never breaks the bundled
  demo or the tests. Point the UI at it with `VITE_API_BASE`.

### Regenerating the bundled data

The player renders `public/parsed.json`. To refresh it after a parse change
(e.g. to pick up new `action` / `text_en` fields) do a live re-parse and copy:

```bash
# ANTHROPIC_API_KEY in .env; clear the cache to force a fresh call
rm -rf .cache && python scripts/parse_check.py
cp outputs/parsed.json web/frontend/public/parsed.json
```

```bash
cd web/frontend && npm install
npm run dev      # eyeball the player (bundled example)
npm test         # offline Vitest — pure runtime logic
npm run build
```

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
