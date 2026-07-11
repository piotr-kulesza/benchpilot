# Stage 3.5 — render fidelity + immersive shell (make it stop looking cheap)

**Read `prompts/master-3d-scene-generator.md` and compare the running player to
`demos/neutrophil-rna-extraction.html` side by side.** Stages 3–4 got the layout
and the lighting/colour right, but the render still reads cheap: the vessel glass
is matte plastic with no refraction or highlights, there's no postprocessing, and
the 3D sits as a small letterboxed panel inside a plain white webpage. Fix both.
Do PART A first — it's the bigger lever.

## Part A — render fidelity (this is what kills the "cheap" look)

1. **Real glass on every vessel.** Replace the current matte/opaque vessel
   material with true transmissive glass. Prefer drei `<MeshTransmissionMaterial>`
   (`transmission={1} roughness={0.06} ior={1.45} thickness={0.35}
   chromaticAberration={0.02} anisotropicBlur={0.1} resolution={256}
   distortionScale={0}`), or `MeshPhysicalMaterial` with
   `transmission:1, roughness:0.06, clearcoat:1, clearcoatRoughness:0.06,
   ior:1.45, envMapIntensity:1.3, transparent:true`. The vessel must refract the
   background AND show a crisp highlight from the key softbox.
   - Performance: transmission is costly — only the HERO (active) vessel needs
     full transmission; neighbours can use the cheaper physical-glass fallback.
     Keep `resolution` modest (256) and `samples` low.
2. **Make the key softbox actually reflect.** Confirm the bright env panel shows
   as a sharp specular hotspot on glass and on the metal/anodized instrument
   surfaces. If not, raise `envMapIntensity` on those materials and lower their
   roughness. Dull instruments = cheap.
3. **Liquid should look like liquid.** Give it a glossy, slightly translucent
   `MeshPhysicalMaterial` (low roughness, a touch of `transmission` ~0.15, strong
   colour) and a subtle meniscus at the top — not a flat opaque disc.
4. **Postprocessing stack** (`@react-three/postprocessing` `EffectComposer`):
   - `Bloom` — subtle, `luminanceThreshold ~0.85`, low intensity, so only
     highlights/emissive bloom (screens, liquid speculars), never a haze.
   - `DepthOfField` — focus on the active station, small bokeh; gentle.
   - `Vignette` — subtle.
   - `N8AO` or `SSAO` — soft ambient occlusion so contacts/crevices darken
     (rotor slots, wells, where liquid meets glass). This adds the "expensive"
     grounding.
   Keep it tasteful and performant; the goal is filmic, not an effects demo.
5. **Geometry detail:** bump lathe segments on vessels (crisp rims/edges), keep
   the rounded bottoms; add the small details the demo has (rim tori, a frosted
   label patch on the tube, a faint meniscus).

**Fidelity acceptance:** a zoomed screenshot of the spin column / centrifuge reads
as real glass + metal with crisp highlights, soft AO in the crevices, and a
filmic bloom/DOF — visually on par with `demos/neutrophil-rna-extraction.html`,
not a matte-plastic toy.

## Part B — immersive shell (turn the widget into an experience)

1. **Full-bleed canvas.** The 3D should fill the viewport, not sit as a rounded
   rectangle in a white document. Dark page background.
2. **Overlay UI, not a white card.** Put the step title/text, phase, progress,
   reagent chips, hazards, and Back/Next as **dark glassy floating panels**
   (`backdrop-filter: blur`, translucent dark, subtle border) layered OVER the
   3D — matching the demo's HUD. Keep the EN/Original and Cinematic/Isometric
   toggles in that language.
3. **Hero framing.** Tighten the camera / scale the active station up so the
   device fills more of the frame (it's currently small with dead space above).
4. **Atmosphere (port from the demo):** floating dust, `FogExp2` depth so the
   line recedes, and the cinematic **intro reveal**. Optional `<Float>` idle bob
   on the hero.

**Shell acceptance:** it reads as an immersive full-screen 3D walkthrough with
dark glassy overlays — not a 3D thumbnail embedded in a white webpage.

## Keep intact
Schema-driven stations, per-step equipment, travelling sample + hand-offs,
cameras, timers, hazards, language toggle, WebGL fallback, and `npm test` green.
All visual knobs stay centralized in `theme.js`. Commit Part A and Part B
separately so each is reviewable.

**Verify with the screenshot loop** (reload → screenshot a device step + a liquid
step) before committing each part — this is exactly the check that caught the
cheap render.
