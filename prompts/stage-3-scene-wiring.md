# Stage 3 — Scene wiring (schema-driven station line)

**Read `prompts/master-3d-scene-generator.md`; the demo
`demos/neutrophil-rna-extraction.html` is the UX target.** Uses Stage 1's
resolver and Stage 2's components. Art direction comes in Stage 4 — here, get the
structure and interaction correct.

## Scope
Rebuild `Scene.jsx` (and supporting hooks) to render ANY parsed protocol:

- Read `public/parsed.json` (`Protocol`/`Step` from `core/schema.py`). Number of
  stations = `steps.length` (nothing hardcoded to 16).
- For each step, `resolveRecipe(step.action)` picks the equipment + vessel + anim.
- **One travelling sample** glides down the line; its container changes only at
  `handoff` steps (`transfer`/`elute`): microtube → spin column → eluate tube.
- **Per-step visibility**: only the active station's equipment is shown/faded in.
- **Two cameras + toggle**: cinematic perspective rail-dolly and isometric
  orthographic (match the demo's toggle + controls).
- **Timers**: `duration_seconds` / `incubate_wait` drive a countdown + the block's
  progress ring — reuse `useCountdown`.
- **Hazards**: render `hazards_en`/`hazards` in the step panel, negatives in RED
  (e.g. "do NOT centrifuge"). Panel cue only — no 3D warning ring.
- **Language**: default `*_en`, fall back to original; keep the EN/Original toggle;
  never alter the original text.
- Keep the WebGL fallback.

## Done when
- `npm run dev` renders the bundled RNA `parsed.json` as N equipment-aware
  stations; Back/Next/Replay, both cameras, timers, hazards, and language toggle
  all work; unknown actions fall back to a plain bench without crashing.
- `npm test` still green.

Commit: `feat(web): schema-driven station line — cameras, timers, hazards, i18n`.
