# Master prompt — generalize the demo into a schema-driven 3D scene generator

**Paste this into Claude Code opened at the repo root of `benchpilot` (this repo).**

---

## Role & goal

You are extending **benchpilot**. Today the web player renders a single generic
glass vessel that changes state per step. We have hand-built a far richer,
art-directed reference scene for ONE protocol:

> **Reference (the gold standard for look, feel, and UX):**
> `demos/neutrophil-rna-extraction.html`
> A self-contained three.js r128 scene: a 16-station "production line" with real
> lab equipment, a travelling sample, cinematic + isometric cameras, per-step
> equipment visibility, timers, and hazard cues.

**Your job:** make the web player render ANY parsed protocol in that style —
equipment-aware, art-directed, driven entirely by `outputs/parsed.json`. The
demo is the target; generalize it, do not special-case the RNA protocol.

Open and study `demos/neutrophil-rna-extraction.html` first. It is the spec.

## The integration (do it this way — it's the low-risk path)

The seam already exists. **Grow it, don't replace it.**

- `core/schema.py` defines a FIXED action vocabulary (`ACTIONS`) and the parser
  tags every `Step.action` with one of them (unknown → `"generic"`).
- `web/frontend/src/vessel/behavior.js` already maps `action → behavior`
  descriptor for a single vessel.

Extend that map from "one vessel, changing state" into **`action → scene recipe`**:
each action resolves to `{ equipment, vessel, animation }`. Port the demo's
equipment + animations into the react-three-fiber `Scene`, selected per step by
`Step.action`. Keep `behavior.js` pure and unit-testable (no three.js import).

**Iron rule (unchanged):** `core/` stays interface-agnostic — zero rendering
knowledge. All of this lives in `web/frontend`. Keep the single batched llm call
in `core/parse.py`. Keep the offline Vitest suite, the EN/original language
toggle, the timer (`useCountdown`), and the WebGL fallback working.

## Data contract (consume the real schema — do not invent fields)

Render from `web/frontend/public/parsed.json` (a copy of `outputs/parsed.json`),
shape defined in `core/schema.py`:

- `Protocol`: `title/title_en`, `summary/summary_en`, `materials[]`, `steps[]`,
  `open_parameters[]`.
- `Step`: `index`, `phase`, `text/text_en`, `kind`, **`action`** (the 13-value
  vocab), `duration_seconds`, `spin{duration_seconds,rcf_min,note}`,
  `reagents[{name,name_en,volume,condition}]`, `conditionals[{condition,then}]`,
  `repeat{count,reason}`, `alternatives[]`, `hazards[]/hazards_en[]`,
  `prep_ahead`, `gaps[]`, `verbatim`.

The number of stations = number of steps. Nothing hardcoded to 16.

## action → equipment/vessel/animation map (the core new artifact)

Build this as a pure resolver (extend `behavior.js` or add `sceneRecipe.js`),
covering every value in `ACTIONS`. Port the matching device/animation from the
demo. Unknown/missing → `generic`.

| action          | equipment shown              | vessel / animation (from the demo)                    |
|-----------------|------------------------------|-------------------------------------------------------|
| `pour_add`      | reagent bottle + pipette     | stream pours into vessel; fill rises                  |
| `pipette_mix`   | pipette                      | tip descends, releases drops; surface ripples         |
| `vortex_mix`    | (bench)                      | vessel swirl + wobble                                  |
| `centrifuge`    | **centrifuge** (domed rotor) | sample seats in rotor; rotor spins; use `spin` fields |
| `incubate_wait` | incubation block             | countdown **ring + timer** from `duration_seconds`    |
| `heat`          | heat block / bath            | rising bubbles + warm glow                            |
| `cool_ice`      | **ice bucket** / cold block  | frost creeps up glass; cold cast                      |
| `transfer`      | (bench)                      | **hand-off**: sample moves vessel A → vessel B        |
| `wash`          | **spin column** + buffer     | buffer added; liquid rinses through                   |
| `discard`       | waste                        | tip/pour-out; flow-through discarded                  |
| `elute`         | **spin column** + eluate tube| single slow drop; clean eluate collected              |
| `measure`       | **NanoDrop**-style reader    | sample read; gauge/readout beside it                  |
| `generic`       | (bench)                      | tube resting on the bench                              |

**Vessels** come from a small library (reuse the demo's lathe profiles):
microtube (rounded bell bottom — NOT pointy), spin column (rounded bottom),
reagent bottle, eluate tube. **One travelling sample** flows through the line;
its container changes only at `transfer`/`elute` hand-offs. Liquid conforms to
the vessel interior; fill/level driven by `reagents` + action.

## Cameras, timers, hazards, language

- **Two cameras, toggle:** cinematic perspective rail-dolly + isometric
  orthographic (as in the demo).
- **Timers:** `duration_seconds` (and `incubate_wait`) drive a countdown +
  progress ring; reuse `useCountdown`.
- **Hazards:** surface `hazards/hazards_en` in the step panel, negatives in RED
  (e.g. "do NOT centrifuge"). Panel cue only — no 3D warning ring.
- **Language:** default `*_en`, fall back to original; keep the EN/Original
  toggle. Never translate the original text — display it verbatim.

## Art direction — REPRODUCE the demo's look exactly (hard-won; do not regress)

These specific choices are why the demo reads well. Translate them into the r3f
renderer config and materials:

- Tone mapping: **`THREE.LinearToneMapping`, exposure ≈ 0.78**. Do NOT use ACES
  or Cineon — they desaturate / lift blacks into a washed, milky look.
- Environment: a **dark neutral studio** — ONE bright key softbox + dark fills.
  Do NOT flood with a near-white environment (it washes every material pale).
- Lighting: low flat ambient/hemi + one strong key → real shadow-to-highlight
  contrast + soft grounded shadows.
- Background: a **mid-tone warm-greige gradient with a vignette** (no white void,
  no dark sci-fi). Bench: darker, gently reflective.
- Run a **one-time saturation pass** over object materials (neutrals stay
  neutral because low-saturation × factor stays low) so colours pop.
- Instruments keep **realistic light-grey bodies**; colour comes from liquids,
  caps, reagents — not from rainbow machine shells or gratuitous LEDs/screens.
- Rounded vessel bottoms; no stray decorative artefacts.

## Robustness (this must handle ANY protocol, not just RNA)

- Every `action` resolves (unknown → `generic`); every missing field has a sane
  default; a malformed step never crashes the scene.
- Prove generality: also render `examples/transformation.txt` end-to-end
  (parse → schema → scene). Expect `heat` → heat block + bubbles, `cool_ice` →
  ice bucket + frost, `pour_add`/`pipette_mix`/`incubate_wait` all correct.

## Acceptance criteria

1. `npm run dev` with the bundled `parsed.json` renders N equipment-aware
   stations that visually match the demo (contrast, saturation, mid-tone bg,
   cinematic/iso toggle, timers, hazards, language toggle, WebGL fallback).
2. Swapping in a DIFFERENT protocol's `parsed.json` (transformation) still
   renders coherently, no crashes, correct equipment per action.
3. `npm test` (Vitest, offline, no GPU) passes — add tests for the pure
   `action → scene recipe` resolver: every `ACTIONS` value maps to a valid
   recipe, unknown → generic.
4. `core/` untouched in spirit (no rendering imports); parse still one batched
   llm call; `pytest -q` still green.

## Suggested order (still one build, but sequence it)

1. Pure resolver `action → scene recipe` + Vitest tests (no three.js).
2. Equipment/vessel component library in `web/frontend/src/vessel/` (port from
   the demo), each a self-contained r3f component.
3. `Scene.jsx`: lay out one station per step, travelling sample, per-step
   visibility, both cameras; wire timers + hazards + language.
4. Apply the art-direction recipe (tone map, studio env, saturation pass, bg).
5. Verify against both `parsed.json` (RNA) and the transformation protocol.
6. Commit per coherent change (repo convention).

**Do not** break the offline tests, the language toggle, the single batched
parse call, or the WebGL fallback. **Do** keep the demo file as the living spec.
