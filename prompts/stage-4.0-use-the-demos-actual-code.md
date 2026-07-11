# Stage 4.0 — STOP reimplementing. Use the demo's ACTUAL code.

## The real problem
Every model in the react app is a **hand-rewritten reinterpretation** of the
demo's model, and every animation was re-derived by hand. That is why the models
all look different and behave oddly, and why no amount of value-tuning converges.

`demos/neutrophil-rna-extraction.html` already contains **every model as a
reusable builder function returning a `THREE.Group`**, and **21 of those groups
carry their own `userData.update(dt)` animation hook**. The code is already
structured exactly for reuse. Use it. Do not rewrite it.

## What to do

### 1. Lift the demo's code VERBATIM into an ES module
Create `web/frontend/src/scene/demoScene.js` by copying these functions from
`demos/neutrophil-rna-extraction.html` **character-for-character**:

- Materials/helpers: `buildSharedMaps`, `makeBrushedNormal`, `makeBrushedRough`,
  `makePlasticRough`, `makeKnurlNormal`, `fresnelize`, `glassMaterial`,
  `matFrosted`, `matPlastic`, `matRubber`, `matSilicone`, `matAnodized`,
  `matBrushed`, `matPainted`
- Models: `buildTube`, `buildPipette`, `buildPipetteStand`, `buildBottle`,
  `buildSpinColumn`, `buildCentrifuge`, `buildColdBlock`, `buildIceBucket`,
  `buildNanoDrop`, `buildDrop`, `buildWaste`
- Scene bits: `makeLabel`, `stationDecal`, `buildEnvMap`, `makeCineBackdrop`,
  `makeGradientTexture`
- The `COL` / `COL_CINE` palette and the `LOOK` lighting config

**The ONLY permitted change** is swapping the r128 global `THREE.*` for
`import * as THREE from 'three'` (plus the modern-three renames:
`outputEncoding`→`outputColorSpace`, `sRGBEncoding`→`SRGBColorSpace`).
Keep every number, lathe profile, material value, and animation line IDENTICAL.
Do NOT "improve", simplify, or re-derive anything.

### 2. Delete the hand-written components
Remove the entire hand-built r3f equipment/vessel library (`src/vessel/equipment/*`
and its Glass/liquid/profiles reimplementations). They are the source of the drift.

### 3. Mount the real groups in React
Render each builder's `THREE.Group` directly:
```jsx
const group = useMemo(() => buildCentrifuge(), [])
return <primitive object={group} />
```
Drive the demo's own animation in `useFrame`:
```jsx
useFrame((_, dt) => { group.userData.update?.(dt) })
```
The 21 self-animating groups will then move EXACTLY as they do in the HTML — no
hand-written animation code at all.

### 4. Keep only what's genuinely new
The ONLY react-side logic that stays is the part that generalizes the demo:
- `resolveRecipe(step.action)` → which builder to mount per step
- the travelling sample + container hand-offs
- camera rig (cinematic / isometric) and step navigation
- the DOM overlay UI (panels, timers, hazards, language)

Everything visual — geometry, materials, lighting, env, background, labels,
decals, animations — comes from the demo's code, unmodified.

## Acceptance
Use the headless screenshot pipeline: render the react app and the HTML demo at
the same step, side by side. The models, materials, lighting, and motion must be
**identical**, not "similar". If any model differs, you rewrote it instead of
importing it — go back and import it.

Keep `npm test` green.
