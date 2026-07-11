# Stage 2 — equipment & vessel component library (react-three-fiber)

**Read `prompts/master-3d-scene-generator.md` and study
`demos/neutrophil-rna-extraction.html` — port its geometry/materials faithfully.**
No scene wiring yet; build each piece in isolation so it can be reviewed alone.

## Scope
Recreate the demo's devices and vessels as self-contained r3f components under
`web/frontend/src/vessel/equipment/`. Reuse the demo's lathe profiles and
proportions. Realistic light-grey instrument bodies; colour comes from liquids /
caps, not the machine shells. Rounded vessel bottoms (no sharp cones).

## Components (one file each, no required props / sane defaults)
- `Centrifuge.jsx` — domed body + spinning rotor (accepts a `spin` speed).
- `IncubationBlock.jsx` — block with wells + a countdown **progress ring**.
- `HeatBlock.jsx` — block; supports rising bubbles + warm glow.
- `IceBucket.jsx` — open tub + translucent ice; supports frost cast.
- `SpinColumn.jsx` — column + collection tube (rounded bottom); flow-through.
- `ReagentBottle.jsx` + `Pipette.jsx` — bottle + descending pipette that pours.
- `Reader.jsx` — NanoDrop-style reader + a readout gauge.
- Vessels: `Microtube.jsx` (rounded bell bottom), `EluateTube.jsx`,
  plus the bottle/column above. Liquid conforms to the interior; `fill` prop.
- `Bench.jsx` — the surface a plain step rests on.

Keep the existing WebGL feature-detect + `Fallback.jsx` path working.

## Done when
- Each component renders on a scratch route/page (e.g. a temporary gallery) with
  no errors, matching the demo's silhouettes.
- No dependency on the schema or Scene yet — pure presentational components.

Commit: `feat(web): equipment + vessel component library ported from demo`.
