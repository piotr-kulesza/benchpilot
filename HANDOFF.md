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

## Principles the hard way (honesty in what the scene claims)

The 3D scene is a claim about what is physically happening. Every one of these
was learned by shipping the opposite.

- **A wrong instrument is worse than a missing one.** Reading a flask on a
  NanoDrop, or a plate on a tube block, asserts something false. The equipment
  contract (`containerContract.js` `INSTRUMENTS`/`resolveInstrument`) lists what
  each instrument ACCEPTS and falls back to the bench when nothing fits — never to
  the wrong device.
- **A meaningless animation is worse than none.** A vessel spinning on the bench
  for no reason implies work that isn't happening. When an (action, container) has
  no instrument or motion, hold the vessel **at rest** with its readout. Stillness
  is honest. (This is why the `measure` and generic fallbacks no longer idle-spin.)
- **A hardcoded special-case can mask a data defect.** The `transfer → spin_column`
  hardcode silently supplied a destination the PARSE had failed to name, hiding the
  missing container for weeks. When you remove a special-case and something breaks,
  **suspect the data, not the removal.** The guard now warns
  (`findTransferHandoffDefects`) instead of papering over it, and a coverage
  assertion runs it over every bundled protocol.
- **Liquid exists only inside glass or inside a tip.** A stream drawn spanning two
  vessels reads as a *wire*, not a pour — and nothing at a bench moves liquid through
  open air. So a **contents transfer is a pipette run** (aspirate from A, dispense
  into B; while in transit the liquid is inside the tip): `configurePipetteTransfer`,
  reusing the `stationReagent` rig. A **nesting move** (`nestsInto`, e.g. a spin
  column into a fresh collection tube) carries the *vessel*, not the liquid — no
  pipette, no liquid drawn. Getting these two backwards is a lie about what the
  scientist does; grep for any bridge/stream/arc geometry between vessels and delete
  it on sight.
- **Nothing floats.** A vessel's resting Y is the CONTRACT `seat` (base on the bench,
  y=0 — every model's origin is at its base), never a `BLOCK_TOP` default. Only a
  station that puts the vessel ON a real riser (a cold block well, a rotor slot, a
  bath) raises it, and it owns that height. If a vessel hovers above its contact
  shadow, its seat is wrong.
- **Not every step happens to the sample.** A *side preparation* — "prepare the DNase I
  mix: 10 µl DNase I + 70 µl RDD buffer" — combines reagents in ITS OWN fresh vessel; the
  sample is not an ingredient and must sit visibly **untouched** beside it. Rendering that
  mix poured INTO the sample is a scientific lie (we shipped DNase pouring into the spin
  column for weeks). This is a closed-vocabulary `prepare` action, NOT a `pour_add`: the
  parser routes reagents-combined-in-a-separate-vessel to `prepare`, its `container` names
  the mix's own fresh tube (never the sample's specialized vessel), and `stateChain` carries
  the sample's colour/level forward unchanged. Guards: `findPrepareOnSampleDefects`
  (renderer) and `test_prepare_never_targets_the_sample_vessel` (parser) run it over every
  bundled protocol. A related lie is dropping reagents: **N reagents → N pipette passes**;
  a step listing DNase I + RDD must show BOTH bottles, and a single reagent with a
  conditional volume (350 µl / 600 µl) is still ONE bottle (dedupe by name).
- **A step must say WHICH vessel it acts on, and a preparation must say WHEN it is made.**
  Once a `prepare` step is on the bench there are two vessels (the sample + the mix), and
  an instruction is ambiguous unless it names its vessel. So every step carries a `target`
  ("sample" by default; a `prepare` targets its own `produces` id — never the sample), a
  `prepare` names its product (`produces`), and a step that uses that mix names it
  (`draws_from`) so it draws from the tube you made, not a bottle from nowhere. A `prepare`
  vessel NEVER enters the sample's container chain (`sampleContainerSequence` skips it).
  Guards: `findTargetDefects` (JS) + `test_every_prepare_names_a_product_and_every_draw_resolves`
  (parser). And a preparation has a WHEN: a **do-ahead** (shelf-stable — 2-ME in RLT, ethanol
  in RPE) is `prep_ahead:true` and lifts OUT of the run into the intake checklist; a
  **just-in-time** one (enzyme mix, DNase I + RDD, anything "prepare fresh") is `prep_ahead:false`
  and is moved to sit **immediately before its consumer** (`arrange_preparations`, pure, with
  `source_index` keeping the source order recoverable). You don't make an enzyme mix and leave
  it out for forty minutes — encoding that is the product's whole claim. When in doubt,
  just-in-time: a prep shown early is a small error, one hidden in a checklist is a real one.
- **The sample never teleports. One sample, one continuous path, for the whole protocol.**
  That continuity is the reason the run reads as a procedure and not a slideshow. Leaving a
  docked instrument (rotor slot, heat block, bath, freezer) the sample **lifts straight up**
  clear of the device (an `exitLift` waypoint the travel loop honours before the glide — it
  must not drag diagonally through the rotor or the lid), *then* glides to the next station.
  Even Next mid-spin must leave properly: stop, open, lift, glide — fast, but never a cut.
  A jump (deep-link) may snap; a sequential Next never does. `undockSample(lift)` +
  `exitLiftPoint` (pure, tested); jumps snap, sequential lifts.
- **Nothing in the scene teleports — not the sample, not a prep vessel, not a reagent.** If
  an object is in two places across two steps it must be SEEN to move between them, because at
  the bench it did; an object that just appears where it's needed is the scene lying about work
  the scientist actually had to do. A prepared mixture is a SECOND travelling object on the SAME
  rails as the sample: built ONCE at its `prepare` station (`demo.makePrep`, scene-parented,
  keyed by `produces`), it persists holding its mixture and is **carried** — glided, eased,
  settled — to the step that `draws_from` it, where the pipette draws OUT of it and its level
  drops. Reuse the sample's machinery (`prepAt`/`getPreps` mirror `S.at`/`vessels`, the frame
  loop's §5b glide mirrors §5); never build a second parallel motion system, and never rebuild
  the tube at the consuming station — that two-objects-look-alike shortcut IS the teleport bug.
  `placePreps` positions each mixture (home vs draw seat) and shows it only across its lifetime
  (made → consumed). A unit test can check the waypoints; it cannot tell you the object moved —
  verify that by watching (`prepX` glides smoothly, e.g. 67.6 → 77.6, not a jump).

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

## Physical-plausibility hooks — INTENTIONAL, and NOT in the demo

`demos/neutrophil-rna-extraction.html` is the visual reference, but it has real
physics flaws. These were fixed on purpose in `web/frontend/src/scene/demoScene.js`
(each marked `// IMPROVEMENT` in code). **Do not "restore" them to match the demo.**

- **Bottles open to be aspirated + their level drops.** `buildBottle` exposes
  `setCap(on)` (the cap lifts up and tilts aside) and `setLevel(v)` (the liquid
  surface drops), driven each frame (bottle pushed to `st.updatables` in
  `addBottle`). `stationReagent`'s timeline opens the cap before the pipette dips
  in, closes it after, and drops the level as liquid is drawn.
- **The sample vessel is CAPLESS.** `buildTube` has no cap mesh and no `setCap`
  (the demo's ported cap/toggle was dropped). Do not re-add cap toggling anywhere.
- **The centrifuge seats the sample in a REAL rotor slot and it rides the rotor.**
  The demo spun an empty rotor with the tube on the bench, and an earlier pass
  parked it in the middle. `buildCentrifuge` exposes `holders` (the 8 fixed-angle
  slots) and an explicit `setLid(open)` hook. `stationSpin` reparents the sample
  INTO `holders[2]` (correct radius + outward tilt) so it orbits with the rotor as
  it spins; the lid closes before the spin and opens after; then it lifts out.
  `undockSample()` frees it if a step change interrupts a spin, and the frame loop
  skips the glide-lerp while `v.userData.docked`.
- **The pipette never clips the top HUD.** `buildPipette` is scaled down
  (`PIP_SCALE`) and `pipetteRun`'s travel arc is kept low so the tall body stays
  clear of the top bar during the pour.

Verify with timed headless shots across a pour (bottle open + level dropping,
capless tube, `?run=1&step=16`) and a spin (sample seated in a rotor slot at the
right tilt, inside a closed lid, rotating with the rotor, `?run=1&step=17`).

---

## Stage 6 — generalized vocabulary + sample-follow containers (DONE / PENDING)

benchpilot now targets ANY wet-lab protocol, not just spin-column extractions.

**DONE (committed, tested, RNA byte-for-byte):**
- 5 new verbs in the closed vocab: `thermocycle` (cyclic PCR), `electrophorese`
  (gel run / electro-transfer), `store` (freeze/hold), `seed` (culture), `stain`
  (dye flood). Lockstep across `schema.py` ACTIONS, the parser prompt, `BEHAVIORS`,
  `RECIPES`, `runtime.js` ACTIONS — the lockstep test guards it.
- **Sample-follow container model** — the STRUCTURAL change. `Step.container` (closed
  `CONTAINERS` vocab) is parsed from prose ("into the wells", "onto a membrane");
  `sampleContainerSequence(steps)` seeds microtube, adopts each parsed container, and
  PERSISTS when unnamed. The old action-inferred `transfer→spin_column`/`elute→eluate`
  special-cases are GONE. `resolveRemoval(container)` = tip (tube) vs aspirate (plate) —
  the discard branch follows it (never tip a plate).
- The RNA render is preserved by two hand-added container fields in the bundled
  `parsed.json` (step 8 → spin_column, step 24 → eluate_tube) — verified NEW==OLD.
- Equipment: `buildThermocycler` (cycle counter from `repeat.count`, lid closes to
  cycle) + `buildGelRig` (migrating bands + voltage). All 5 verbs mount a real station.
- Repeats render: StepCard dots (≤12) / ×N badge (PCR), thermocycler on-block counter.

**DONE (Stage 7):** the 8-protocol offline coverage harness — `tests/fixtures/protocols/`
(verbatim texts) + committed `tests/fixtures/cache/` (raw parses) + `tests/test_coverage.py`
(re-parses offline, no key). Aggregate generic 2.7%/112 steps; per-verb guards green.

**DONE (Stage 8):** real container geometry — every container mounts its OWN vessel; nothing
falls back to the tube. `demoScene.js` gains `buildCryovial/buildWellPlate/buildFlask/
buildDish/buildSlide/buildMembrane/buildGelSlab/buildAgarPlate` (each via `attachSampleLiquid`,
the shared setLevel/setColor/setLabel/update state) + `buildFreezer/buildStainingTray/
buildSpreader`. `buildSample()` builds them all; `S.only()` is generalized to any key; `V_OF`
in StationScene maps every container token to a real vessel. Flat vessels seat on the bench;
store glides the vial into the freezer, seed sweeps a spreader on agar, stain floods a slide
in a tray. Still stylized — NO transmission, NO postprocessing (grep-guarded).

**PENDING:** nothing structural. Optional polish only (e.g. a dedicated `buildDewar` for LN₂;
richer plate/membrane liquid conforming). The pitch is earned: any protocol → the sample
travels the real glassware.

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

1. **Pipette clips the top HUD bar** during the pour travel — its body goes above
   the frame mid-animation.
2. **Either/or doesn't change the 3D.** The homogenise step offers "QIAshredder
   column" vs "5× through a 20–21 G needle", but picking the needle still renders
   a centrifuge. The station must resolve from the *chosen* alternative (and there
   is no needle/syringe model yet).
3. **STAGE 5 — never done, and it's the thesis.** The product has only ever been
   proven on the protocol it was built from. Parse `examples/transformation.txt`
   and confirm a *different* protocol renders correctly. Needs a real
   **heat-block builder** (`heat_block` is currently stubbed to `buildColdBlock`).
   Until this passes, benchpilot is a one-protocol demo, not a generator.

### Closed
- ~~Parse bundling~~ — decomposition now strict: every centrifugation and every
  timed wait is its own step; mixing folds into the add; discard folds into the
  spin; `wash` removed from the vocabulary. 20 procedure steps, add→spin rhythm.

---

## Run

```bash
cd web/frontend && npm install && npm run dev   # http://localhost:5173/?run=1
npm test                                        # offline Vitest
pytest -q                                       # offline, no key needed
python scripts/parse_check.py                   # live parse (needs ANTHROPIC_API_KEY)
```

Prompts used to build this live in `prompts/`.
