# Stage 4 — art-direction pass (match the demo's look exactly)

**Read `prompts/master-3d-scene-generator.md` (the "Art direction" section) and
compare side-by-side with `demos/neutrophil-rna-extraction.html`.** This is the
stage that makes it look premium instead of washed-out. These values are
hard-won — reproduce them, don't re-derive.

## Apply, precisely
- Renderer: `gl.toneMapping = THREE.LinearToneMapping`,
  `gl.toneMappingExposure ≈ 0.78`. **Never ACES or Cineon** (they desaturate /
  lift blacks into a milky, low-contrast look — this was the core bug).
- Environment: a **dark neutral studio** IBL — ONE bright key softbox + dark
  fills. Do NOT use a near-white environment (it floods every material pale).
- Lights: low flat ambient/hemi + one strong key → real shadow-to-highlight
  contrast and soft grounded contact shadows.
- Background: a **mid-tone warm-greige gradient with a vignette** (no white void,
  no dark sci-fi). Bench: darker, gently reflective.
- Run a **one-time saturation pass** over object materials after build (traverse;
  bump HSL saturation; neutrals stay neutral because low-sat × factor stays low).
- Instruments keep **realistic light-grey bodies**; saturate the liquids / caps /
  reagents instead. No rainbow shells, no gratuitous LEDs/screens.
- Rounded vessel bottoms; remove any stray decorative artefacts (e.g. floating
  frost specks).

## Done when
- Reloaded in the browser, the scene visually matches the demo: contrasty,
  saturated objects on a comfortable mid-tone background — NOT pale/flat.
- Do the check the way it was validated today: reload and screenshot a couple of
  steps (one with the centrifuge, one with liquid) before committing; confirm no
  washed-out regression.
- `npm test` still green.

Commit: `feat(web): art-direction pass — linear tonemap, studio env, saturation`.
