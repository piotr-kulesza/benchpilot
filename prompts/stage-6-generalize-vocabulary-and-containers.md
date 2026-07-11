# Stage 6 — Generalize the vocabulary + move to a sample-follow container model

**One-line goal:** make benchpilot parse and render *any* wet-lab protocol correctly —
not just spin-column extractions — by (a) adding a small set of new action verbs,
(b) replacing the hardcoded tube→column→eluate vessel chain with a **sample-follow**
container model where the sample carries its own container as state, and (c) fixing
the wash/repeat/cycling representation. The demo `demos/neutrophil-rna-extraction.html`
stays the visual source of truth and the neutrophil RNA protocol must keep working
byte-for-byte.

---

## Why this work exists (evidence — do not skip)

We ran the **real, current parser** (`core/parse.py`, unchanged) against **8 protocols**
from techniques it was never built for. Result: **118 steps, 92% landed on a real verb,
8% on `generic`.** Good — nothing crashed and the fallback held. But the number flatters
the system. Three concrete failures hide behind it, and they are what this stage fixes:

1. **The vessel model assumes a microtube.** `sampleContainerSequence()` only knows
   `microtube → spin_column → eluate_tube`, inferred from the *action*. But the test
   protocols live in **96-well plates, culture flasks, agarose gels, cryovials, glass
   slides, membranes**. Even when the verb is right, the renderer would draw a microtube
   for an ELISA plate. This is the biggest problem and it *grows* with technique diversity.

2. **`transfer` is overloaded and its destination is hardcoded.** In `sceneRecipe.js`:
   `transfer: { equipment: 'spin_column', vessel: 'microtube', handoff: true }`. So
   "aliquot into a cryovial", "load a gel well", "seed a flask", and "move vials to the
   nitrogen dewar" all render as a spin-column handoff. The verb isn't wrong; baking the
   destination into the recipe is.

3. **Cycling, washes, and repeats collapse.** PCR's "30 cycles of denature/anneal/extend"
   became five flat `heat` steps with the ×30 loop gone. "Wash 3× with TBST" became a
   single `pour_add` with the ×3 surviving only in prose, and with no removal step — so a
   wash-heavy protocol shows the tube endlessly filling, breaking the "you can see what's
   in the tube" promise. Genuinely missing verbs (`electrophorese`, `store`, `seed`/plate,
   `stain`, `thermocycle`) went to `generic`.

The missing-verb list is **bounded** (~5), which is the encouraging part. The container
model is the real structural work.

---

## Non-negotiable invariants (read before touching anything)

- **Read first:** `CLAUDE.md`, `HANDOFF.md`, `WHAT_IT_IS.md`, `core/schema.py`,
  `core/parse.py`, `web/frontend/src/vessel/behavior.js`,
  `web/frontend/src/vessel/sceneRecipe.js`, their `.test.js` files, the Scene component
  that calls `resolveRecipe(step.action)` and mounts the three.js builders (see
  `prompts/stage-4.0-use-the-demos-actual-code.md`), and `demos/neutrophil-rna-extraction.html`.
- **The parse core is pure and interface-agnostic.** `core/` must not import web/UI/three.js.
- **The action vocabulary is a CLOSED enum with a `generic` fallback.** Every value must
  resolve in `behavior.js` AND `sceneRecipe.js`; unknown/missing → `generic`. Never let a
  step render blank or crash. `core/schema.py::_action()` coerces unknown → `generic`.
- **Four things stay in lockstep:** `ACTIONS` (schema), the parser `SYSTEM_PROMPT` vocab
  list, `BEHAVIORS` (behavior.js), `RECIPES` (sceneRecipe.js). A test asserts every
  `ACTIONS` value resolves — keep it green.
- **`behavior.js` and `sceneRecipe.js` import nothing heavy** (no three.js/DOM/network) so
  they stay unit-testable under Vitest in node.
- **One batched LLM call, cached by input hash.** Do not make parsing step-by-step.
- **Parse fidelity lives in the `SYSTEM_PROMPT`.** Edit it additively and carefully.
- **Regression:** the neutrophil RNA protocol must still parse and render exactly as it
  does today. Check against `docs/spike_targets.md`. Do not regress the demo's look.
- **Bilingual rule stays:** original language in base fields, English in `_en` fields.

---

## The design, settled

**New action verbs (add exactly these 5 — resist adding more; fold the rest):**

| verb | means | equipment (station) | animation gist |
|---|---|---|---|
| `thermocycle` | a *cyclic* thermal program (PCR/qPCR): repeated denature/anneal/extend | thermocycler | lidded block, temperature glow cycling hot↔cool, a **cycle counter** driven by `repeat.count` |
| `electrophorese` | apply an electric field to migrate/transfer through a gel or onto a membrane (agarose run, SDS-PAGE run, Western electro-transfer) | gel tank + power supply | bands/dye front migrating, a current/voltage indicator |
| `store` | place at −20/−80/4 °C or in LN₂ for holding/freezing (end-state storage, not transient on-ice) | freezer / fridge / LN₂ dewar | frost creep, vessel placed inside, door/lid |
| `seed` | dispense or spread the sample **into/onto a culture vessel** to grow it (seed a flask/dish/well; spread bacteria on an agar plate) | bench + plate/flask (+ spreader for agar) | sample dispensed into vessel; on an agar plate, a spreader sweeps |
| `stain` | apply a stain/dye over a sample surface (Gram stain flood, post-gel stain, IHC) | staining tray / bench + slide | colour flooding over the sample surface |

**Fold, do NOT add verbs for:** warm-to-RT/equilibrate (→ `incubate_wait` or `generic`),
prepare-a-smear (→ handled by the container becoming a slide; action `generic`),
blot-dry (→ `discard`, i.e. remove residual liquid), harvest-by-trypsinization (→
**decompose** into aspirate-medium + wash + add-trypsin + incubate + neutralize, exactly
like the passaging protocol, never a single `generic` step).

`vortex_mix`, `homogenize`, `elute` were never triggered across the 8 protocols — leave
them (they serve the RNA reference), just don't expect them elsewhere.

**Sample-follow container model (the core change):**

- Add an optional **`container`** field to `Step` (parsed from the prose). Closed vocab:
  `microtube, tube, well_plate, flask, dish, gel, slide, cryovial, membrane, spin_column,
  eluate_tube, bottle, agar_plate` + `generic`. Unknown/missing → **persist the previous
  container** (do not reset).
- The parser reads the container straight from the text — "into each cryovial", "into the
  wells", "onto a nitrocellulose membrane", "into new culture flasks", "on a glass slide".
  If a step names no new container, omit the field and the sample stays where it was.
- Generalize `sampleContainerSequence(steps)`: seed with `microtube` (or the first named
  container), then for each step use its parsed `container` if present, else carry the
  previous. This *replaces* the current action-inferred logic (the `transfer` →
  `spin_column`, `elute` → `eluate_tube` special-cases go away).
- **Decouple the two axes in `sceneRecipe.js`:** `equipment` stays keyed off `action`
  (a centrifuge spins, a plate reader reads). The **container** now comes from the
  sample-follow sequence, NOT from a per-action `vessel`/`handoff` entry. Delete the
  hardcoded `vessel`/`handoff` fields from `RECIPES`. `transfer`'s spin-column special-case
  is retired — a "transfer" is just a step whose container differs from the previous one,
  animated as *remove sample from old container → insert into new*.
- **Container animation library:** each container type gets geometry + an **insert-sample**
  and **remove-sample** motion. This is what makes "the sample travels the whole protocol"
  work across plates/slides/flasks, per the vision doc.

**Wash / removal directionality (the `pour_add` fix):**

- `pour_add` (liquid in) is fine and correct for most adds — do not touch its meaning.
- A **non-spin wash** (well, membrane, slide, flask — no centrifuge) must decompose to
  `pour_add` (buffer) **+ `discard`** (pour/aspirate it off), mirroring the existing
  spin-wash rule (`pour_add` + `centrifuge`). `discard` already exists and already animates
  a pour-out (`tip: 1.15`); reuse it. Do NOT add a new pour-out verb.
- The **removal motion is parameterized by the current container**: a `microtube`/`tube`/
  `spin_column` **tips and dumps**; a `well_plate`/`flask`/`dish`/`membrane` is
  **aspirated** (pipette suck-out — never tip a plate). Same principle as insert/remove:
  the verb says *what*, the container says *how it looks*.

**Repeats and cycles (wire up the existing `repeat` field):**

- Parser must populate `Step.repeat = {count, reason}` for "wash three times", "in
  triplicate", "repeat 5×", "powtórzyć". Stop dropping the count into prose only.
- The player renders `repeat`: loop the step's animation `count` times (or show a `×N`
  badge and replay). Applies to washes and to the `thermocycle` cycle count.
- **`thermocycle` representation:** emit ONE `thermocycle` step for the cycled block, with
  `repeat.count` = number of cycles and the per-phase temps/times captured in
  `text`/`text_en` (and, if trivial, a small optional structured `profile` you may add to
  the step — but reusing `repeat.count` + text is enough; keep the schema change minimal).
  The **initial denaturation** and **final extension** are single events → their own `heat`
  steps adjacent to the `thermocycle` step. One machine (the thermocycler) = one station.

---

## Execution plan (stages in dependency order)

Do these **sequentially** — stages 1–4 all touch the same small set of core files and
must not be parallelized (see orchestration note). Stage 5 is the one safe fan-out.

### Stage 0 — orient & baseline
Read the files above. Run the existing test suites (`vitest` for the frontend, `pytest`
for `core/`) and confirm green. Note the current `ACTIONS` count and the passing lockstep
test. Skim `docs/spike_targets.md`.

### Stage 1 — schema (`core/schema.py`)
- Add the 5 verbs to `ACTIONS`, each with a one-line comment. Keep `generic` last.
- Add `container: Optional[str] = None` to `Step` (base field; `_en` not needed — container
  names are canonical tokens, not prose). Add a `_container()` coercer mapping to the closed
  vocab, unknown → `None` (persist).
- If you add an optional `profile` to the thermocycle step, keep it tiny and optional.
- Update `Step.from_dict`/`to_dict` accordingly. Do not break existing fields.
- Commit: `feat(core): add thermocycle/electrophorese/store/seed/stain verbs + parsed container field`

### Stage 2 — parser prompt (`core/parse.py` `SYSTEM_PROMPT`)
Additive edits only:
- Add the 5 verbs to the vocabulary list with crisp decision rules + one example each.
  Be explicit about boundaries: `thermocycle` = *cyclic* thermal only (single timed holds
  stay `incubate_wait`/`heat`); `electrophorese` covers gel runs AND electro-transfer to a
  membrane (this is what "transfer proteins to the membrane" is — NOT the `transfer` verb);
  `store` = holding/freezing at temperature (distinct from transient `cool_ice`); `seed`
  covers spreading on agar and seeding flasks/wells; `stain` = applying a dye over a sample.
- Add the **container-extraction** instruction: for each step, set `container` when the
  text names where the sample now sits; otherwise omit it (it persists).
- Add the **non-spin wash** rule: `pour_add` (buffer) + `discard` (pour/aspirate off) when
  there is no centrifuge, mirroring the existing spin-wash rule.
- Add the **thermocycle** rule (one step for the cycled block, `repeat.count` = cycles;
  initial-denat and final-extension as their own `heat` steps).
- Add the **repeat** rule: populate `repeat` for "3×"/"triplicate"/"repeat"/"powtórzyć".
- Update the "Return JSON of exactly this shape" block to include `container` (and `profile`
  if added).
- Commit: `feat(core): teach parser new verbs, container extraction, non-spin wash, cycling, repeats`

### Stage 3 — behavior + recipe (`behavior.js`, `sceneRecipe.js`)
- `behavior.js`: add descriptors for the 5 new verbs (e.g. `thermocycle`: cycling
  warm/cool + `ring`/counter; `electrophorese`: a `migrate` field; `store`: `frost` + place;
  `seed`: `dispense`/`spread`; `stain`: `flood` colour). Extend the base descriptor with any
  new fields and document them in the header comment. Every verb resolves; `generic` fallback intact.
- `sceneRecipe.js`: map the 5 verbs to their equipment. **Remove** the per-action
  `vessel`/`handoff` fields — container is now sample-follow. Keep `resolveRecipe(action) →
  { equipment, anim }`. Retire the `transfer` spin-column special-case.
- Add a pure **`resolveRemoval(container)`** helper (tip vs aspirate) and a pure
  **container → geometry key + insert/remove-motion** map (logic only, no three.js here).
- Update `behavior.test.js` / `sceneRecipe.test.js`: every `ACTIONS` value resolves; every
  container resolves; removal motion resolves; unknowns → generic/persist. Keep lockstep test green.
- Commit: `feat(web): new verb behaviors, decouple container from action, container-parameterized removal`

### Stage 4 — sample-follow runtime (pure logic)
- Generalize `sampleContainerSequence(steps)` to the sample-follow rule (seed + persist +
  parsed container). Unit-test it against a mixed sequence (tube → well_plate → membrane →
  back). Keep it pure.
- Wire the sequence + `resolveRemoval` into the runtime that feeds the Scene
  (`web/frontend/src/lib/runtime.js` and the Intake/player as needed) so each step knows
  its container and removal motion. No three.js in this stage.
- Commit: `feat(web): sample-follow container sequence + wiring`

### Stage 5 — 3D geometry  ⟵ **the one safe parallel fan-out**
Match the demo's art direction exactly (matte materials, lighting, scale — copy numbers
from `demos/neutrophil-rna-extraction.html`, whose builders `buildCentrifuge`,
`buildColdBlock`, `buildIceBucket`, `buildSpinColumn`, `buildNanoDrop`, `buildBottle` are
the style reference). Each item below is an **independent module/component** — spawn one
subagent per item ONLY IF your codebase keeps builders in separate files so they don't
collide; otherwise do them serially.

- **Equipment builders:** `buildThermocycler`, `buildGelRig` (tank + electrodes + power
  box, migrating bands), `buildFreezer` / `buildDewar`, `buildAgarPlate` + spreader,
  `buildStainingTray`.
- **Container models + motions:** geometry for `well_plate, flask, dish, gel, slide,
  cryovial, membrane, agar_plate` (microtube/column/eluate already exist), each with an
  **insert-sample** and **remove-sample** motion, and the tip-vs-aspirate removal.
- After the fan-out, ONE integration pass wires them into the Scene via `resolveRecipe` +
  the container map, and confirms every action and every container mounts something (never blank).
- Commit(s): `feat(web): thermocycler/gel/freezer/plate/staining builders + container models & motions`

### Stage 6 — repeat rendering
Render `repeat` in the player: loop the animation `count` times (or `×N` badge + replay),
including the `thermocycle` cycle counter. Commit: `feat(web): render step repeats and cycle counts`

### Stage 7 — tests, coverage harness, regression
- **Offline coverage harness** (matches the repo's "cached parses need nothing" design):
  add the **8 test protocols** as fixtures under `tests/fixtures/protocols/`, generate their
  parses ONCE (needs `ANTHROPIC_API_KEY`), and **commit the cached LLM responses** so the
  harness runs offline in CI. For each protocol assert structural expectations: total-step
  range, that key operations map to the intended verb (PCR cycling → one `thermocycle` with
  `repeat.count≈30`; ELISA/Western washes → `pour_add`+`discard` pairs with `repeat`; gel
  run → `electrophorese`; agar spread / flask seed → `seed`; −20 °C / LN₂ → `store`; Gram
  flood → `stain`), and a **generic rate ≤ 5%** overall.
- The 8 protocols: neutrophil RNA extraction (existing reference), bacterial transformation,
  standard PCR, Western blot, adherent-cell passaging, sandwich ELISA, agarose DNA gel,
  cell cryopreservation, Gram stain.
- **RNA regression:** the neutrophil protocol still parses/renders identically; re-check
  `docs/spike_targets.md`. Take before/after screenshots of the demo path and confirm no
  visual regression.
- Run full `pytest` + `vitest`; all green, lockstep test included.
- Commit: `test(core,web): 8-protocol offline coverage harness + RNA regression guard`

---

## Verification checklist (must all pass before calling this done)

- [ ] Every `ACTIONS` value resolves in `behavior.js` and `sceneRecipe.js`; lockstep test green.
- [ ] Every container resolves to geometry + insert/remove motion; unknown → persist; nothing renders blank.
- [ ] Coverage harness: generic ≤ 5% across all 8 protocols; the per-protocol verb assertions pass.
- [ ] PCR shows ONE thermocycler station with a cycle counter, not five flat `heat` steps.
- [ ] An ELISA/Western wash visibly fills THEN empties (pour_add + discard), and the ×3 shows as a repeat.
- [ ] A 96-well plate is aspirated, a microtube is tipped (removal motion follows the container).
- [ ] The neutrophil RNA protocol is byte-for-byte unchanged in parse and visually unchanged in render.
- [ ] `core/` still imports nothing from web/three.js; `behavior.js`/`sceneRecipe.js` still node-testable.

---

## Orchestration note (subagents — where they help and where they hurt)

- **Stages 1–4 and 6–7: single agent, sequential.** They repeatedly edit the same core
  files (`schema.py`, `parse.py`, `behavior.js`, `sceneRecipe.js`, `runtime.js`) and have a
  strict dependency chain (schema → prompt → behavior/recipe → runtime). Parallel agents on
  shared files produce merge conflicts and lockstep drift. Don't.
- **Stage 5 only: fan out**, one subagent per equipment builder / container model, **iff**
  each is its own file. Give each subagent the demo as the art-direction reference and a
  fixed interface (builder returns a three.js group with a known mount point + play(anim)).
  Then a single integration pass wires them in. If builders share one file, do them serially.
- Net: this is mostly a sequential, staged job (like your existing `prompts/`), with one
  bounded parallel burst for geometry. Expect the parser/schema/behavior work to be fast;
  the 3D geometry is the long pole.

---

## Additions from review (do not skip)

- **Supersedes `prompts/stage-5-generalize-second-protocol.md`.** That earlier file proposed
  a `plate_spread` verb, which is subsumed by `seed`. Delete or archive it so an agent does
  not implement both.
- **Container must mean "where the SAMPLE now sits", never where a reagent lives.** "Add
  350 µl RW1 **from the bottle**" must NOT set `container: bottle`. State this explicitly in
  the parser prompt — it is the most likely parse failure mode of this change.
- **Stage 5 geometry: read `HANDOFF.md`'s gotcha list first.** New builders are exactly where
  someone reintroduces photoreal glass or a postprocessing stack. The demo is *stylized*:
  `MeshPhysicalMaterial` opacity 0.24 + clearcoat + `fresnelize()`, **zero postprocessing**,
  `LinearToneMapping` @ 0.78, and the three r155+ π light-intensity divide (`LIGHT_SCALE`).
  Verify new equipment by sampling pixel RGB against the demo, not by eye.
- **Finish the in-flight plausibility polish first** (bottle cap opens to aspirate, sample
  seats in a real rotor slot, tube cap removed, pipette HUD clipping) — it touches
  `demoScene.js` choreography that Stage 5's new containers will build on.
