# benchpilot — handoff

State of play, hard-won lessons, and what's still open. Written after the session
that ported the hand-built HTML demo into the schema-driven react player.

---

## The two artefacts

1. **`demos/neutrophil-rna-extraction.html`** — the hand-built reference scene.
   Self-contained three.js r128, one protocol, hardcoded. **This is the visual
   spec and the source of truth.** It looks right. Don't "improve" it.
2. **`web/frontend/`** — the real product: parses ANY protocol into the schema
   (`core/schema.py`) and renders it with the demo's own code.

The whole job was making (2) look and behave exactly like (1) while being driven
by parsed data instead of hardcoded steps.

---

## THE most important lesson

**Do not reimplement the demo. Import it.**

Most of the pain in this project came from rebuilding the demo's models,
materials, lighting, and animations by hand in react — every one came out as a
subtly different approximation, and no amount of value-tuning ever converged.

The demo is already structured for reuse: every model is a builder returning a
`THREE.Group`, and 21 of them carry their own `userData.update(dt)` animation.

The fix (now in place, `web/frontend/src/scene/demoScene.js`): the builders are
lifted **verbatim** from the demo, mounted with `<primitive object={group} />`,
and driven with `useFrame((_, dt) => group.userData.update?.(dt))`. Zero
hand-written geometry, materials, or animation.

**If something looks wrong: diff against the demo. If it differs, it was
rewritten instead of imported. Go import it.**

---

## Gotchas that cost us hours (do not rediscover these)

- **three r155+ is physically-correct: light intensity is divided by π.** The
  demo's r128 intensities render ~3× too dim in the modern build. This alone
  caused most of the "too dark / muddy / washed-out" impressions. Compensated
  with `LIGHT_SCALE` in `StationScene.jsx`. **Verify brightness by sampling
  actual pixel RGB against the demo — never by eye.** (Bench should be
  ~`rgb(220,214,203)`.)
- **The demo is stylized, NOT photoreal.** Its glass is
  `MeshPhysicalMaterial` at `opacity 0.24` + clearcoat + `fresnelize()`.
  It has **zero postprocessing** — no bloom, no DOF, no SSAO. Adding
  `MeshTransmissionMaterial` and an effect stack made it look *worse* and
  "not like the HTML". Don't.
- **Tone mapping: `LinearToneMapping` @ exposure 0.78.** ACES/Cineon desaturate
  and lift blacks into a milky wash.
- Colour comes from **liquids, caps, reagents** — never from instrument bodies
  or status LEDs. (LEDs were removed three times; keep them out.)

## Architecture that must not regress

- **Build the whole line ONCE** (`buildLine`): one station per step along +X.
  Stations persist; they are never destroyed/rebuilt on step navigation.
- **The camera travels** (rail-dolly) between stations; neighbours recede into
  fog. Step changes are never a cut.
- **ONE sample** (`initSample`) persists for the whole protocol, glides station
  to station, and carries its state — step N's start = step N−1's end. Its
  container swaps only at `transfer` / `elute` hand-offs.
- **Station choreography = `enter()` + `timeline(p)`**, p = per-step progress
  0→1 (not real time). `stationReagent` drives `pipetteRun` and only starts the
  fill at `p > 0.62`. Skipping this layer is why "the pipette doesn't move and
  liquids fill instantly".
- `core/` stays pure. One batched llm call in `core/parse.py`.

---

## The parse is the other half of the quality

The renderer maps **one `action` → one device → one animation per step**. So a
step bundling several operations can only ever show one of them. Decomposition
rules (in `core/parse.py`'s system prompt):

- **Every centrifugation is its own step.**
- **Every timed wait/incubation is its own step** (needs `duration_seconds` for
  the timer).
- **Fold mixing into the preceding add** (the pipette dispenses *and* mixes).
- **Fold "discard the flow-through" into the spin it follows.**
- `wash` should decompose to `pour_add` + `centrifuge` — it must not survive as
  an action, or it mounts a bare centrifuge with no reagent bottle.
- Target ≈ the demo's 16-step procedure. Keep the source sentence in `verbatim`.

Non-actionable steps (notes, prose-only prep/QC) are filtered out of the 3D
runner and shown in the intake — see `isActionableStep()` / `partitionSteps()`.

---

## Verify with pixels, not vibes

Claude Code has a headless screenshot pipeline (system Chrome via
puppeteer-core, renders `dist` at 1440×900). **Use it.** Render the react app and
the demo at the same step, compare. For animation, capture at two `p` values and
assert they differ. Most regressions in this project were caught only when
someone actually looked at the render.

---

## OPEN / NOT DONE

1. **Parse still bundles operations.** Step 15 ("Wash with 500 µl RPE
   (centrifuge 15 s), then again with 500 µl RPE (centrifuge 2 min)") is ONE step
   with two adds and two spins → renders as a bare centrifuge with no bottle.
   Steps 12 (DNase + 15-min incubation), 16 (transfer + spin) and 17 (add + wait
   + spin) bundle too. Fix per the decomposition rules above.
2. **Pipette clips the top HUD bar** during the pour travel.
3. **Step 6 either/or doesn't change the 3D.** The needle-pass alternative to the
   QIAshredder still renders a centrifuge; the station must resolve from the
   *chosen* alternative.
4. **STAGE 5 — never done, and it's the thesis.** The product has only ever been
   proven on the protocol it was built from. Parse `examples/transformation.txt`
   and confirm a *different* protocol renders correctly. Needs a real
   **heat-block builder** (`heat_block` is currently stubbed to `buildColdBlock`).
   Until this passes, benchpilot is a one-protocol demo, not a generator.

---

## Run

```bash
cd web/frontend && npm install && npm run dev   # http://localhost:5173/?run=1
npm test                                        # offline Vitest
pytest -q                                       # offline, no key needed
python scripts/parse_check.py                   # live parse (needs ANTHROPIC_API_KEY)
```

Prompts used to build this live in `prompts/`.
