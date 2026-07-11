# Stage 3.7 — stop drifting: match `demos/neutrophil-rna-extraction.html` 1:1, wire animations, finish English

The react port has drifted from the demo and recent tuning REGRESSED it: glass now
looks like chrome/mirror, the scene is shoved to the right, per-action animations
don't actually run, the background/lighting reads as a flat "boring lab" instead
of the demo's, and reagent strings still show the original language.

**Principle for this whole ticket: STOP re-deriving values. Open
`demos/neutrophil-rna-extraction.html` and copy its EXACT numbers** for glass,
environment, lights, background, and per-action animation. The demo is the source
of truth and already looks right — port it, don't reinvent it.

## 1. Glass — revert the mirror (it was good two commits ago)
The `roughness:0.04` + `envMapIntensity:1.7` push turned glass into a mirror.
Match the demo's `glassMaterial()` exactly (physical glass with clearcoat and a
MODERATE envMapIntensity ~1.3 and its transmission/opacity settings). Result:
clear refractive glass with a soft highlight — NOT a chrome ball.

## 2. Scene is shoved right — recenter
Reduce/remove `HERO_BIAS_X`. The hero should sit comfortably centered in the
viewport (a small bias so the left panel doesn't cover it is fine, but it's
currently far off to the right). Balance it against the compact panel.

## 3. Animations don't run — wire them
The `anim` descriptors resolve but nothing moves. Drive them in `useFrame`,
matching the demo's motion per action: centrifuge rotor SPINS, liquid POURS and
the fill rises, pipette dips + releases a drop, vortex swirl/shake, heat bubbles +
warm glow, incubate ring fills with the timer, frost creep on ice. Verify each
action visibly animates — this is a functional regression, not polish.

## 4. Background + lighting — port the demo's, it's richer
The current stage looks flat and dull. Copy the demo's `makeCineBackdrop()`
gradient (warm greige + light pool + vignette), its `buildEnvMap()` (dark neutral
studio: one bright key softbox + dark fills), and its `LOOK.cinematic` lights
(exposure 0.78, low ambient/hemi, one strong warm key, aux rim) EXACTLY. The react
stage should be visually indistinguishable from the demo's stage.

## 5. Finish English (still leaking original language)
Reagent chips show the original language, e.g. "10 µl na 1 ml RLT". In EN mode
NOTHING should show original-language text.
- Add `volume_en` and `condition_en` to `Reagent` in `core/schema.py`, have the
  single batched parse call in `core/parse.py` fill them (English renderings of
  volume/condition), and re-run `scripts/parse_check.py` to refresh
  `outputs/parsed.json` + the bundled `public/parsed.json`.
- Audit EVERY overlay/chip/label/tag (reagents, spin data, hazards, phase, timer)
  for original-language leakage; in EN mode all display strings use the `*_en`
  fields, falling back to original only when a translation is truly missing.
- Keep the original text intact and shown under the Original toggle.

## Constraints
Keep the schema-driven stations, hand-offs, cameras, timers, WebGL fallback, and
`npm test` green. All visual knobs stay in `theme.js` / `theme.post`. Commit in
small pieces (glass revert, recenter, animations, background, English) so each is
separately reviewable and I can screenshot-verify each.
