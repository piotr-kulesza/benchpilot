# Stage 3.6 — make the 3D dominate the screen and read crisp

The immersive shell + glass materials are in, but the render still feels weak.
Fix the layout bug FIRST (0), then framing/crispness. No new materials.

## 0. FIX: the stage only fills the top half — black band at the bottom (do this first)
The `<Canvas>` and the `.station-stage` background gradient (ported from
`makeCineBackdrop`) are NOT filling the full-bleed viewport — they're stuck at the
old stage-rectangle size while the shell went full-bleed. Result: the greige
stage + bench only cover the top ~55%, and the entire bottom ~45% is the dark page
showing through as a black band (behind the step panel and nav). This is also why
the 3D "only takes half the screen."
- Make the `<Canvas>` AND its background gradient fill the whole immersive
  viewport: `position: fixed; inset: 0; width: 100vw; height: 100vh`, behind the
  glassy overlays; confirm the renderer resizes to full height.
- Ensure the greige background / fog covers the entire frame — NO black void below
  the bench. Bench/scene reach all four edges; panels float on top.
- Verify: no black band anywhere; greige to every edge.

## 0b. Remove the dust
Delete the floating dust motes entirely — they read as cheap "particle" noise, not
atmosphere. No dust particles in the scene.

## 1. Make the hero BIG
- The active station currently fills roughly a quarter of the frame height. Get
  it to ~60–70%: move the perspective camera closer (lower z), and/or scale the
  active station up. The device/vessel should be the clear subject, not a small
  object on a big empty bench.
- Keep it centered in the *visible* area — i.e. account for the step panel on the
  left: bias the hero's screen position toward the open right side (or reduce the
  panel width, below) so the enlarged hero isn't hidden behind the panel.
- Isometric mode: scale up to match.

## 2. Shrink / lighten the step panel so the 3D isn't crowded to half
- The step-content panel is too dominant (full-height left third, oversized
  title). Make it a **compact, secondary** overlay: narrower, smaller type,
  docked so it frames the 3D rather than competing with it. The 3D is the star;
  text supports it.
- Make sure no panel overlaps the enlarged hero. Reagent chips / HUD / nav stay
  as glassy floating elements but trimmed to not eat the scene.

## 3. Make the hero tack-SHARP (kills the "shitty" feel)
- Depth-of-field: lock the focus distance to the ACTIVE station's world Z and cut
  the bokeh scale so DOF blurs ONLY neighbors + far background — the hero must be
  razor sharp, not hazy.
- Bloom: drop intensity a notch and keep `luminanceThreshold` high so it only
  catches speculars/emissive, never a soft haze over everything.
- Glass crispness: lower the hero glass `roughness` (~0.04) and raise
  `envMapIntensity` so the key softbox reads as a sharp highlight and edges stay
  clean. Confirm the transmission resolution isn't so low it softens the refraction.

## Acceptance
- A screenshot shows the hero device/vessel LARGE (dominating the frame) and
  TACK SHARP, with DOF blur only on neighbors/background, on the immersive dark
  stage — comparable to a hero product shot. The 3D clearly owns the screen; the
  step panel is a compact support element.
- `npm test` still green; all knobs stay in `theme.js` / `theme.post`.

Verify with the reload → screenshot loop before committing.
