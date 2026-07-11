# Stage 5 — prove it's a GENERATOR: render a protocol it has never seen

This is the thesis of the whole project. Everything so far has only ever been
proven on the protocol it was built from. Until a *different* protocol renders
correctly, benchpilot is a one-protocol demo.

Target: **`examples/transformation.txt`** — bacterial transformation by heat
shock. Read it first. Note what it does NOT contain: no centrifuge, no spin
column, no RNA. If our RNA-extraction equipment shows up anywhere in it, the
generator is broken.

## 1. Equipment the demo does not have — build it (in the demo's style)

Write these as builders in `src/scene/demoScene.js`, matching the demo's
conventions exactly (a `THREE.Group`, its own `userData.update(dt)` + setters,
the same `mat*` material helpers, realistic light-grey bodies, colour only from
liquids/caps):

- **`buildWaterBath()`** — a 42 °C water bath / heat block for the `heat` action.
  (`heat_block` is currently stubbed to `buildColdBlock` — replace that.) Tube
  seats in the bath; visible warmth (rising bubbles / warm cast) ramping with `p`.
- **`buildAgarPlate()`** — a petri dish with agar, plus a spreader. For plating.
- **`buildShakingIncubator()`** — for the 37 °C / 225 rpm recovery. May reuse the
  block with an orbital shake, but it must visibly shake.

## 2. Vocabulary: plating has no action

`ACTIONS` in `core/schema.py` has nothing for "spread onto a selective plate" —
it would fall back to `generic` and render a bare bench. Add **`plate_spread`**:
- to `ACTIONS` in `core/schema.py`
- to the parse system prompt (so the model can tag it)
- to `resolveRecipe` → agar plate + spreader
- with a station timeline: liquid drops onto the plate, spreader sweeps it out.

## 3. Parse + load the second protocol

- Run the parser on `examples/transformation.txt` and write its `parsed.json`.
- Let the app load **either** protocol (e.g. `?protocol=transformation`), with
  both bundled — the demo must be able to show both back to back.
- Verify the parse: every step atomic (one action each), the timed steps carry
  `duration_seconds` (10 min thaw, 30 min ice, 45 s heat shock, 2 min ice,
  60 min recovery, 16–18 h plates), and the **negatives are captured as hazards**
  ("Do not vortex", "Do not exceed 45 s").

## 4. What must be visible on screen

Step through the whole transformation run and confirm:
- `cool_ice` steps → the **ice bucket**, tube in the ice, frost.
- The 42 °C step → the **water bath**, tube in it, heat shock, with a **45 s
  timer** and "Do NOT exceed 45 s" in red.
- "mix by gently flicking" → a gentle flick, and **"Do NOT vortex" in red**.
- `pour_add` (plasmid DNA, SOC) → bottle + pipette, correct volumes.
- Recovery → the **shaking incubator**, visibly shaking, 60 min timer.
- Plating → the **agar plate**, liquid dropped and spread.
- **Nowhere** does a centrifuge, spin column, or NanoDrop appear.
- Conditionals ("for ligation reactions, use 2 µL"; "20 µL high-efficiency vs
  100–200 µL for ligations") resolve from the intake answers.
- Gaps (plating volume, antibiotic choice) surface as intake questions.

## Acceptance

Headless screenshots of the transformation walkthrough at each station, showing
correct equipment per action, timers on the timed steps, negatives in red — and
zero RNA-extraction equipment. Both protocols must still render correctly (the
RNA one must not regress). `npm test` and `pytest -q` green.

**When this passes, the pitch changes from "look at this protocol" to "give it
any protocol."** That is the whole product.
