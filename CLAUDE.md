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
  its module under `src/scene/` (one commit per builder), keeping the builder's look and
  signature; verify with a baseline → current diff.
- Verify renders by **headless screenshot**, not by eye. See "Judging renders".
- **Cutaway for enclosing containers.** When the subject sits inside an opaque container
  (water bath, ice bucket, centrifuge shell and rotor slot, freezer, plate reader, gel tank,
  a closed lid), the container's NEAR WALL is rendered see-through (`declareCutaway` in
  `scene/modelKit.js`; the station calls `setCutaway(true)` when the subject is seated in it).
  It changes the wall's material opacity only — **it never moves or resizes the subject or
  the wall**; the geometry checks must stay green with it on. **A cutaway removes a wall,
  not the scene:** only the near (+z, camera-side) wall changes — round parts are built as
  front and back halves so the back stays solid; never a back or side wall (the backdrop the
  subject is read against), never a liquid (water keeps its density), never the subject. The
  only other thing a cutaway may take is a declared **carrier** (a rotor: its disc and slots
  turn with the tube, so no fixed half of it is "near"). Cut walls and liquids draw before
  the vessels, so the subject is never veiled. `cutaway.test.js` enforces all of it.
- **The camera frames the subject; it never rescales anything.** `frameStation` fits a
  frame per pose from the subject's real extent plus the props the step uses
  (`stationCamera.fitFrame`); the instrument around it is shown only while the subject
  stays legible. A 41 mm tube and a 700 mm freezer do not share one camera distance.
- **The subject is the largest object in frame.** A source that out-sizes the subject (a
  250 mL bottle for a tube or a slide) is set down OUT of frame (`stageSources`, then
  `frameStation` moves it past the frame edge); a poured one is tipped from high enough that
  only its stream comes in. A same-size source (a µl tube) stays in the back row, in frame.
  While a rotor spins, the rotor carrying the sample is the subject.
- **The dispense is framed:** the held pipette's tip at its lowest point over the subject,
  and half its cone above, are in the frame.
- **A vessel that cannot stand is in a holder.** A conical tube or spin column put down on
  the bare bench stands in a `tube_stand` (`scene/holders.js`, set out by `addBenchStands`;
  `placeOnBench` seats a vessel in a stand at its base point). Holders are furniture: not
  the subject, not its rivals.
- **No text on vessels.** Bottles carry a colour band in the reagent's colour; tube writing
  patches are blank. The reagent is named by the station title (over its source's front
  edge) and the HUD — text wrapped round a 10 mm tube rendered cropped and read as a bug.
- **Stage only what the step uses.** No pipette stand (the pipette is held); sources stand
  in a compact back row behind the subject; a µl reagent comes from a 1.5 mL tube, a mL
  reagent from a bottle; a step that names no reagent draws from the sample itself; a
  prepare does not stage the idle sample (it does not use it). No
  station-number decal; the title plate names the subject and stands over it.

## Scene units and dimensions (non-negotiable)

- **1 world unit = 100 mm.** Declared once, in `web/frontend/src/scene/dimensions.json`
  (`world_unit_mm`) and read through `src/scene/dims.js` (`dims(id)` → world units).
- Every vessel's and instrument's real size (height, diameter/footprint, wall, working
  volume, socket-relevant sub-dimensions) lives in `dimensions.json`, each value tagged
  `src` (a listed standard / catalogue spec), `est` (estimated — says on what basis) or
  `derived`. **Never type a size into a builder; never invent a number without `est`.**
- Layout gaps (`bench_gap`, `socket_fit`, `lift`, `contact_epsilon`) are also in the file.
- **Pivot:** every builder returns its model with the origin at the centre of its base
  (tools held by a tip — the pipette — have the tip as origin, `userData.pivotAt='tip'`).
  `fitArt(art, id)` in `scene/modelKit.js` scales a builder's drawing to the table envelope and
  recentres it; functional geometry (bores, slots, stages, shelves) is authored in world
  units from the table on the returned root.
- **Sockets, not coordinates** (`src/scene/sockets.js`): instruments declare named mount
  points (`addSocket`) accepting table ids; a vessel is `placeInto` a socket — a class the
  socket does not accept is a `SocketError` / `st.socketErrors`, never a render. Station
  bench items are placed by `benchPlace` / `benchSlot` (real footprints + `bench_gap`).
- **Geometry audit** (`src/scene/geometryAudit.js`, `stationAudit.js`): contact,
  stability (a resting object whose base span / height < 0.2 — a conical tip — must be in a
  socket or held), containment, interpenetration, relative scale over every station × 41 poses, plus the
  pivot check — in `npm test` (`geometry.*.test.js`) and `npx vite-node
  scripts/geometry-audit.mjs`. Accepted defects: `src/scene/geometry-exceptions.json`
  (dated, with a clearing condition; a stale one fails). Mark non-solids `fx(mesh, kind)`
  and in-hand objects `userData.held`.
- **Legibility audit** (`src/scene/visibilityAudit.js`, `stationAudit.auditVisibility`):
  every station declares its subject (`st.subject()` / `st.subjectAt(p)`); through the
  runner's own camera it must cover ≥ 3 % of the frame (a 1.5 mL tube at the framing's 55 %
  height cap covers 3.55 %), be ≤ 25 % hidden behind anything opaque, centre inside the safe
  area (clear of the top HUD band), and be the LARGEST object in frame (dominance: no other
  spec'd object's in-frame box is bigger — its holders, the step's instrument, held tools
  and the step's other subjects aside) — `visibility.test.js`
  and `npx vite-node scripts/visibility-audit.mjs`.
- **Scale sheet:** `?scale=1` (shots group `scale`) — every model at real size on one
  ground line, orthographic, with a ruler. Look at it after any builder change.

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

- **`src/scene/`** — the builder library from the hand-built demo, split by family.
  `demoScene.js` is now a BARREL that re-exports every module, so `import * as demo`
  call sites never change. Every `buildX()` is wrapped in its per-builder seeded random
  stream (`streams.wrap`, same name) at the bottom of its own module.
  - `vessels.js` (tube, spin column, cryovial, plate, flask, dish, slide, membrane, gel,
    agar) · `props.js` (pipette, stand, bottle, waste, syringe, spreader, drop) ·
    `instruments/{thermal,motion,readers,gel,staining}.js`
  - `modelKit.js` (`fitArt`, `tagSpec`, `fx`, `declareCutaway`, `openTopBox`,
    `slabWithHoles`) · `materials.js` · `liquid.js` · `labels.js` · `palette.js` ·
    `util.js` (`lerp`, `clamp`, `easeInOut`) · `environment.js` (renderer, env map,
    backdrop, floor)
  - `sample.js` (the travelling sample + prep tubes: `initSample`, `getSample`,
    `undockSample`, `makePrep`, `prepAt`) · `bench.js` (bench layout, back row, sources)
    · `pipetting.js` (the held pipette, `pipetteRun`, `stationReagent`) · `spin.js`
  **The builders are the art: never replace or re-author one, but fix a builder's bug in
  place** (e.g. detail placed in the wrong local space so it floats, a solid panel hiding
  a glass door). A pure refactor must be proven pixel-identical with
  `scripts/pixel-diff.py <before> <after>` (the capture's noise floor is zero).
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
- The pipette is a held tool and is not framed: its body can leave the top of the frame
  during a pour (the subject never does — the legibility audit guards that).
- An either/or choice does not change the 3D (no needle/syringe model).
