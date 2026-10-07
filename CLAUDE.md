# benchpilot

**Thesis.** Paste any messy lab protocol → get a runnable, timed, gap-flagged
guide. The wedge is instant ingestion (one Claude call does the structuring)
plus a genuinely runnable 3D walkthrough: durations become timers, conditionals
become branches, either/or steps become choices, hazards (including *negatives*
like "do NOT centrifuge") are surfaced, and every underspecified value becomes an
open question answered before the run starts.

## Status

1. **Parse fidelity — proven on the reference protocol.** All targets in
   `docs/spike_targets.md` parse from the real Polish protocol. Judge in
   `outputs/parsed_preview.html`.
2. **Player — built** (`web/frontend/`). Intake (open questions, prep-ahead,
   materials, hazards) → a one-step-at-a-time runner with timers, resolved
   conditionals, either/or choices, tracked repeats, hazards in red.
3. **Station scene — built.** The hero is a *bench line*: one station per step,
   the right equipment for the action, and ONE sample that travels the whole
   protocol and visibly changes. Driven entirely by the parsed schema.
4. **Coverage — 9 bundled protocols** in `web/frontend/public/protocols/`
   (137 steps total). This is the generalisation harness: the scene must hold up
   on protocols it was not built from.

Reference protocol: `examples/Protokol_ekstrakcji_RNA_neutrofile.docx` (Polish
RNA extraction; do NOT translate — parse in place).

## Iron rule (non-negotiable)

The parse core is **pure and interface-agnostic**. `parse_protocol(text, llm)`
takes protocol text + an injectable `llm(system, user) -> str` and returns
structured data (`core/schema.py`). **Zero web / UI / file knowledge in `core/`.**

- **One batched call.** The whole protocol is parsed in a SINGLE llm call, never
  per-step. The raw response is cached by a hash of the input.
- Heavy/docx libs are **lazy-imported**. A live run needs `ANTHROPIC_API_KEY`;
  cached runs and the offline tests need nothing.
- **Commit per change.**

## Scene honesty rules (non-negotiable)

These govern every change to the 3D. They are correctness rules, not taste:

- A **wrong instrument is worse than a missing one.** If the action does not
  resolve to a known instrument, show the bench — never a plausible guess.
- A **meaningless animation is worse than none.** Motion must depict what the
  step physically does.
- **Nothing floats and nothing teleports.** Leaving a docked instrument (rotor
  slot, heat block, bath, freezer) the sample lifts straight up to a clearance
  height first — see `exitLiftPoint` in `vessel/sceneRecipe.js`.
- A **`prepare` never targets the sample vessel.** A side prep happens in its own
  fresh tube; making the mix inside the sample's spin column is a lie.
- **Never tip a plate, dish, membrane or slide** — those aspirate. Only tubes tip.
  This is the `removal` axis in `resolveContainer`.
- **Do not rewrite the hand-built demo from scratch** — its builders are imported,
  not re-authored. **A bug in a builder is fixable**: correct it in place inside
  `scene/demoScene.js` (one commit per builder), keeping the builder's look and
  signature; verify with a baseline → current diff.
- Verify renders by **headless screenshot**, not by eye. See "Judging renders".

## The player — `web/frontend/` (Vite + React 18)

Consumes the **schema only**; it does not depend on how `parsed.json` was
produced. Default data source is bundled `public/parsed.json`, so the demo runs
with zero backend.

- `src/lib/runtime.js` — pure runtime logic (duration formatting, conditional
  resolution from intake answers, alternative selection, repeat counting, hazard
  classification, `localize`/`stepText`/`reagentName`). Unit-tested offline under
  Vitest — no DOM, no network, no real timers. Wall-clock lives only in
  `src/hooks/useCountdown.js`.
- `src/components/Runner.jsx` — the run UI; `Intake.jsx`, `StepCard.jsx`,
  `StepTimeline.jsx`, `Timer.jsx`, `Home.jsx`, `Complete.jsx`.
- Voice control: `lib/voiceIntent.js`, `lib/voiceDispatch.js`, `lib/voiceArming.js`,
  `hooks/useVoice.js` — all pure logic + tests, DOM only in `VoiceControl.jsx`.
- Deep-link a run: `?run=1&step=5&kit=micro&cells=le` (`&lang=orig` for source
  language).

### The 3D — two modules, one contract

- **`src/scene/demoScene.js`** (~143 KB) — the imported-verbatim builder library
  from the hand-built demo. Every `buildX()` (containers, instruments, pipette
  rig, bench, lights, env map, backdrop) plus the travelling-sample model
  (`initSample`, `getSample`, `undockSample`, `prepAt`, `makePrep`) and easing
  helpers (`lerp`, `clamp`, `easeInOut`). **This file is the art: never replace or
  re-author a builder, but fix a builder's bug in place** (e.g. detail placed in the
  wrong local space so it floats, a solid panel hiding a glass door).
- **`src/vessel/StationScene.jsx`** (~78 KB) — the R3F scene. `configureStation(st, opts)`
  is the single entry point that turns one parsed step into a station (equipment,
  container, reagent colours, timeline, camera push, countdown dial). The default
  export `StationScene` lays the stations out along +X, dolly-glides the camera on
  a step change, and fades distant stations.
- **`src/vessel/sceneRecipe.js`** — pure resolvers, the decoupled axes:
  - `resolveRecipe(action)` → `{ equipment, anim }`. Unknown → `generic` (bench).
  - `resolveContainer(container)` → `{ geo, removal }`. Unknown → generic (a tube).
  - `sampleContainerSequence(steps)` → the ONE sample's vessel as each step begins
    (carry forward unless the step names a new container; `prepare` never advances it).
  - Invariant checkers: `findTargetDefects`, `findTransferHandoffDefects`,
    `findPrepareOnSampleDefects` — run these, they catch real lies (see
    `scripts/schema-audit.mjs`).
- **`src/vessel/behavior.js`** — pure `action → behavior` descriptor map. Kept in
  lockstep with `sceneRecipe` so the two never drift.
- `src/vessel/containerContract.js`, `geometry.js`, `theme.js` (all art-direction
  knobs, reagent colours), `StationCanvas.jsx` (the `<Canvas>` wrapper),
  `StationView.jsx`, `Fallback.jsx` (WebGL feature-detect + error boundary — never
  blank, never crash).
- Deps: `three`, `@react-three/fiber`, `@react-three/drei`,
  `@react-three/postprocessing` (split into a cached `three` vendor chunk).

### Dev harness routes

- `?models=1&item=<id>&angle=front|top[&bare=1][&bench=dark|light]` — build one
  model in isolation. Catalogue: `src/dev/registry.js` → `MODELS`, each with an
  `orient` note stating its CORRECT resting pose, so a render can be audited
  against stated intent.
- `?matrix=1&action=<a>&container=<c>&p=<0..1>[&from=<c>]` — drive ONE real
  station through its timeline, reusing the same `configureStation` the runner
  uses, so the harness cannot diverge from production. Cells enumerated by
  `MATRIX_CELLS` / `MATRIX_TRANSITIONS`.

### Render sets are not tracked

`web/frontend/dev-shots/` is **intentionally gitignored**. Captures are deterministic
(per-tile seed, per-builder random streams, fixed-step clock), so the baseline is
regenerated from a commit rather than stored in git (~80 MB per set):

```bash
cd web/frontend && npm run dev
node scripts/shots.mjs --set baseline
```

A baseline/current diff is only meaningful when **both sets were rendered on the same
machine with the same browser build** — GPU, driver and Chrome version all change pixels.

### Judging renders

Never judge by eye, and never judge from build output. Render, then look:

```bash
cd web/frontend && npm run dev          # the harness routes need the DEV server
node scripts/shots.mjs --set current    # fixed set → dev-shots/current/**
node scripts/contact-sheet.mjs current  # tiled sheets → dev-shots/sheets/*.png
node scripts/schema-audit.mjs           # pure-node semantic defect report
```

`scripts/shots.mjs` pulls its model and matrix lists from `src/dev/registry.js`
*in the browser*, so the shot set never drifts from the registry. `--set baseline`
refreshes the committed baseline to compare against. Ad-hoc captures still live in
`scripts/dev-shots.mjs`, `runner-shot.mjs`, `runner-shot-protocol.mjs`,
`timer-shot.mjs`, `thumbs.mjs`, `perf-probe.mjs`.

Review rubric and the paste-ready audit prompt: `docs/scene-review.md`.

### Collisions and motion — measured, not eyeballed

```bash
node scripts/collision-audit.mjs [--protocols a,b] [--only proto:station] [--out f.json]   # dev server
node scripts/collision-audit.mjs --snap proto:station:frame                                 # evidence PNG
python3 scripts/tile-diff.py approved current                                               # pixel diff of two sets
```

`src/dev/collisionAudit.js` (pure, three-mesh-bvh; proven red by `collisionAudit.test.js`):
solids crossing, an object at rest touching nothing or below the bench, a moving object
sweeping through a surface, a moving part deeper in its own object than at rest.
`src/dev/motionAudit.js`: a teleport (an isolated jump; a pop in the camera's view) and an
abrupt start/stop. The driver (`src/dev/collisionDriver.js`) runs the LIVE runner frame by
frame through `window.__benchLine` (dev builds only): it enters each station with Next, holds a
timed step at rest (as before Start), drives p, and lets vessels arrive. Builders mark what is
not a rigid solid with `auditKind` metadata (`'fluid'`, `'granular'`, `'effect'`) — never rendered.

**Tempo — one knob.** `src/scene/tempo.js` → `ANIMATION_TEMPO` (1.6): the frame loop divides dt by it
for every motion (step progress, centrifuge choreography, builders' `update`, vessel trips and springs),
so all of it — liquid included — slows together; a protocol timer and the camera keep real time. The
audit drivers (`collisionDriver`, `liquidFrames`) run the same slowed wall time.

Motion rules the scene now keeps: a vessel leaving a station makes a TRIP (straight up — out
along its axis first from a tilted seat, out through the front from an enclosure — over, and
down, or in from the front under an overhead instrument), one smootherstep in time; a target
that jumps is reached on a critically damped spring; a timeline's own path is followed
exactly; a step's clock waits for its vessels to arrive; the pipette waits at its HOME and
every pass starts and ends there.

### Liquid ledger — every volume from the protocol

`src/vessel/liquidLedger.js` is the ONE source of truth for how much liquid is in every vessel at
the start and end of every station (`buildLedger(steps, { containers, altByStep, colorOf })`);
`configureStation` draws only what it says. Every change is an explicit op — `add`, `move`,
`discard`, `retire` — so a station replays exactly (`liquidLedger.test.js`: conservation,
continuity n → n+1, doubling, the tip, the neutrophil volumes, every unstated volume flagged).

- Aspirate subtracts from the source, dispense adds to the destination; reagent bottles are
  unlimited sources (their drawn level still falls by what is drawn, against their stock).
- A spin of a spin column moves its liquid into the collection tube (`flow`); "discard the
  flow-through" empties it once the lid is open. Elution moves the column's liquid into the
  elution tube. Moving the column to a clean tube sets the used collection tube aside.
- **Volume rules** (`src/lib/volume.js`): exact → that volume; a **range ("30–50 µl") → its
  midpoint**; "10 µl per sample / per 1 ml X" → the stated amount; "2 mL per 10 cm²" → read
  against a 25 cm² T-25 (flagged); "one volume" → what the vessel holds; "twice the volume of X"
  → 2 × the last add of X; a conditional pair (350 / 600 µl) → the first variant (the one the
  title states). **Unknown ("X µl", "minimal volume", none) → a fixed placeholder: 10 % of the
  receiving vessel's nominal capacity, flagged.** A mix made on the bench with unstated parts is
  sized to what the protocol later draws from it. "X" with "A − X" → X = A / 2. A mass or a plate
  is not a liquid. A pellet starts at 0 µl. `node scripts/liquid-report.mjs` prints every flag.
- **Level from volume, not height** (`src/scene/liquidShape.js`): a volume, as a share of the
  vessel's nominal capacity, fills the same share of its DRAWN inner volume (the builder's own
  lathe profile, or its box/cylinder); `levelFor` inverts it. No vessel is resized.
- **The pipette is a P200** (its decal): up to 1 mL is pipetted in passes of ≤ 200 µl (a station
  of P passes lasts `STEP_DUR·(1 + 0.35·(P − 1))`); the tip fills to what it drew and empties on
  the destination's dispense curve. A reagent is POURED where the scene always poured (≥ 50 mL,
  or the step says pour / rinse) — the stream lasts volume / 10 mL·s⁻¹; anything else is
  pipetted, and a mL pipette move is drawn as one pass (no serological pipette is modelled;
  flagged — a pour there would remove the pipette rig and re-fit the camera). An aspiration to
  waste passes through the tip, never held.
- Surfaces (slide, membrane, gel, agar plate) have no drawn interior: their volume is kept, the
  demo's levels draw them. The dev matrix has no ledger and keeps the demo's levels.
- **One clock: a liquid moves only with its transfer.** A volume changes only while the tip is
  below the source's surface (drawing) or inside the target (dispensing) with the plunger moving,
  while the vessel rides a turning rotor, or while a stream connects two vessels — and on that
  motion's own curve (`drawProgress` / `dispenseProgress`, the tip set in the same frame). Builders
  in volume mode draw their level and colour AS SET, with no easing of their own. A colour is the
  volume-weighted mix of what flowed in, and changes only during an inflow; the tip carries its
  source's colour. Every vessel of the line enters a station at the ledger's start (a hidden one
  too). "Discard the flow-through" is done at the bench, at the next station with the column: it
  stands aside and the pipette takes the flow-through into a waste beaker, a tip at a time.
  Proof: `node scripts/liquid-frames.mjs` (dev server) checks every frame of every station and
  exits 1 on any violation (`src/dev/liquidFrames.js`, proven red by `liquidFrames.test.js`).
- `node scripts/liquid-sheet.mjs [--protocol id]` (dev server): every station at start, middle
  and end, the ledger volume beside what the scene draws (read back through the drawn shape).

### Regenerating the bundled data

```bash
# ANTHROPIC_API_KEY in .env; clear the cache to force a fresh call
rm -rf .cache && python scripts/parse_check.py
cp outputs/parsed.json web/frontend/public/parsed.json
```

```bash
cd web/frontend && npm install
npm run dev      # eyeball the player (bundled example)
npm test         # offline Vitest — pure logic, no GPU
npm run build
```

## Layout

- `core/schema.py` — dataclasses; the intellectual core (Protocol, Step, …).
- `core/ingest.py` — .docx / .txt / pasted string → plain text (lazy imports).
- `core/parse.py` — the single cached llm call + system prompt.
- `scripts/parse_check.py` — run parse, write `outputs/parsed.json` + preview.
- `scripts/gen_examples.py`, `scripts/reparse_examples.py` — the 9-protocol set.
- `tests/test_parse.py` — offline test (fake llm, canned JSON).
- `docs/spike_targets.md` — the parse-fidelity checklist.
- `docs/scene-review.md` — the render review rubric + audit prompt.
- `web/api.py` — optional FastAPI `POST /api/parse` over the real core. Guarded;
  its absence never breaks the bundled demo or the tests (`VITE_API_BASE`).

## Open

- **Generalisation is the thesis.** The scene is proven on the reference
  protocol; the other 8 are the test of whether the verb and container
  vocabularies actually hold. `schema-audit.mjs` reports which actions and
  containers fall back to `generic` — every fallback is a step that renders bland.
- Pipette clips the top HUD during pours.
- An either/or choice does not change the 3D (no needle/syringe model).
