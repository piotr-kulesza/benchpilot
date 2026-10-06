# Polish round — smoothness, collisions, motion (branch `polish`, from e972bcf)

The approved look (e972bcf) is unchanged: no material, light, camera, framing, size or model
was changed. Every fix is a seat, a placement or a motion path. Measured, not eyeballed.

## Baseline

`dev-shots/approved` — the full shot set rendered at e972bcf (64 model, 104 matrix, 137 runner
tiles — every station). Captures are deterministic: a re-render reproduced it 305/305
pixel-identical (`scripts/tile-diff.py approved check0`).

## 1 · Smoothness (frame probe, production build)

| | before (e972bcf) | after (polish) |
|---|---|---|
| timed stations stepping at React's 10 Hz (repeated poses) | 30 of 30 — 10 287 / 12 376 animating frames | 0 — 0 / 12 640 |
| stations freezing on first entry (shader compile) | 42 — worst 1 017 ms (transformation 3) | 0 |
| frames over 33 ms (all 137 stations) | 26 | 2 (worst 50 ms) |

`scripts/frame-probe.mjs` (production build), per protocol: `dev-shots/perf/frames-{before,after}-<protocol>.txt`.

Fix: cherry-picked 5d6e40e (timed animation on a per-frame clock, injectable for the harness)
and c87b3a1 (constant point-light pool; every program precompiled at load). Static renders
after the cherry-picks: 305/305 identical to `approved`.

## 2 · The check, and the red list before fixing

`src/dev/collisionAudit.js` + `motionAudit.js`, driven on the live runner by
`scripts/collision-audit.mjs` (every station entered with Next, frame by frame). Proven red on
deliberate defects (`collisionAudit.test.js`, `motionAudit.test.js`). Red list BEFORE (all 137
stations, final check definition): `docs/polish-redlist-before.json`; after: `docs/polish-redlist-after.json`.

## Red counts, before → after (same check, both sides)

| scope | | stations | collision-red | motion-red | intersect | float | sunk | sweep | teleport | abrupt start | abrupt stop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| neutrophil_rna | before | 26 | 22 | 25 | 35 | 9 | 0 | 38 | 2 | 24 | 17 |
| neutrophil_rna | after | 26 | 17 | 0 | 18 | 1 | 0 | 26 | 0 | 0 | 0 |
| all 9 | before | 137 | 119 | 128 | 254 | 64 | 18 | 245 | 39 | 121 | 26 |
| all 9 | after | 137 | 68 | 2 | 64 | 11 | 0 | 87 | 0 | 2 | 1 |

(A float seen only on a run's first frame — no rest history yet — is not judged, on either side.)

## 3–4 · What changed (all committed separately on `polish`)

- Travel: a vessel leaving a station makes an eased trip (out along its axis from a tilted seat,
  out through the front from an enclosure, straight up, over, down — or in from the front under
  an overhead instrument); a target that jumps is reached on a critically damped spring; a
  timeline's own path is followed exactly; a step's clock waits for its vessels to arrive.
- Pipette: held; waits at a fixed home; every pass starts and ends there; a source opens for its
  own draw only; a pass waits for a carried prep.
- Centrifuge: the tube is lowered into its slot (seated on its floor) and rests there before
  Start; it spins down with the rotor and stays docked.
- Seats: flat vessels (membrane, slide) on the bench; the plate on the shaker's clips; the gel on
  the tank floor and its bench spot clear of the tank; stage seats clear of arm / lens; the
  stand clear of a plate / flask; the column on its fresh tube.
- Builder bug fixes (one commit each): pipette tip liquid inside the tip; bottle cap lifts before
  it swings; freezer door swings out; well plate notch no longer below the plate.
- Hand-off and spreader: in and out through the top of the frame — nothing pops in view.

## Still red — needs a decision (a model / size change, excluded by this round's rules)

- Rotor slot narrower than the tube / column it holds (all centrifuge stations).
- Freezer drawn as a solid box (no cavity): the stored tube is inside solid material.
- Plate reader drawn as a solid box: the plate slides into solid material.
- Thermocycler block without well holes; 96-well plate without well holes (a dispensing tip
  enters plastic).
- Water-bath liner drawn as a closed box; inverted microscope's condenser lower than the flask.

## Still red — fixable, not done in this round

Western membrane (pipette × membrane, 4 floats), gram-stain slide floats (3), passaging 2–5
pipette × flask cap/neck, gel rig (agarose 11, western 2, pcr 8), pcr 1–2 multi-pass pipette,
a few floats (agarose 12, cryopreservation 6, pcr 5, neutrophil 23), neutrophil 22 (the eluate
tube appears over the rotor: a vessel switch inside a centrifuge step has no hand-off).

## Judgement call to review

Centrifuge stations: the tube no longer hovers over the open rotor before Start — it rests in
its slot. Honest, but at the runner's framing the tube is now small and its liquid is hidden
(`dev-shots/beforeafter/neutrophil_rna__step03.png`).

## Changed tiles (170 of 305; every other tile is pixel-identical to `approved`)

All 95 changed runner tiles are stations on the collision red list; no model tile changed.
Before/after pairs: `dev-shots/beforeafter/` (regenerate: shots.mjs --set current, tile-diff).

| tile | Δ px | reason |
|---|---|---|
| runner/agarose_gel__step04.png | 26445 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); stand moved left, clear of the plate/flask it stood under |
| runner/agarose_gel__step08.png | 10341 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample) |
| runner/agarose_gel__step09.png | 26625 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample) |
| runner/agarose_gel__step11.png | 54679 | gel seated on the tank floor; set back on its bench spot after the run |
| runner/agarose_gel__step12.png | 17394 | vessel rests on the stage clear of the arm / lens |
| runner/cryopreservation__step03.png | 269 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample) |
| runner/cryopreservation__step04.png | 10337 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample) |
| runner/cryopreservation__step05.png | 26998 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample) |
| runner/elisa__step02.png | 21197 | tube lowered into its rotor slot and resting there before Start (was: hovering over the open rotor) |
| runner/elisa__step04.png | 10927 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample) |
| runner/elisa__step05.png | 43290 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); stand moved left, clear of the plate/flask it stood under |
| runner/elisa__step06.png | 30454 | plate rests on the shaker clips (they stood up through it) |
| runner/elisa__step07.png | 46143 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); stand moved left, clear of the plate/flask it stood under; plate rests on the shaker clips (they stood up through it) |
| runner/elisa__step08.png | 35546 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); stand moved left, clear of the plate/flask it stood under |
| runner/elisa__step09.png | 45671 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); stand moved left, clear of the plate/flask it stood under |
| runner/elisa__step10.png | 35265 | plate rests on the shaker clips (they stood up through it) |
| runner/elisa__step11.png | 35815 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); stand moved left, clear of the plate/flask it stood under |
| runner/elisa__step12.png | 45688 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); stand moved left, clear of the plate/flask it stood under |
| runner/elisa__step13.png | 30457 | plate rests on the shaker clips (they stood up through it) |
| runner/elisa__step14.png | 46135 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); stand moved left, clear of the plate/flask it stood under; plate rests on the shaker clips (they stood up through it) |
| runner/elisa__step15.png | 35557 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); stand moved left, clear of the plate/flask it stood under |
| runner/elisa__step16.png | 45668 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); stand moved left, clear of the plate/flask it stood under |
| runner/elisa__step17.png | 469 | sample arrives by an eased trip (lift, carry, lower) and the step waits for it |
| runner/elisa__step18.png | 46149 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); stand moved left, clear of the plate/flask it stood under |
| runner/elisa__step19.png | 35557 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); stand moved left, clear of the plate/flask it stood under |
| runner/elisa__step20.png | 45682 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); stand moved left, clear of the plate/flask it stood under |
| runner/elisa__step21.png | 468 | sample arrives by an eased trip (lift, carry, lower) and the step waits for it |
| runner/elisa__step22.png | 46144 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); stand moved left, clear of the plate/flask it stood under |
| runner/elisa__step23.png | 35562 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); stand moved left, clear of the plate/flask it stood under |
| runner/elisa__step24.png | 45673 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); stand moved left, clear of the plate/flask it stood under |
| runner/elisa__step25.png | 31017 | plate rests on the shaker clips (they stood up through it) |
| runner/elisa__step26.png | 45680 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); stand moved left, clear of the plate/flask it stood under; plate rests on the shaker clips (they stood up through it) |
| runner/gram_stain__step01.png | 50060 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); flat vessel seated on the bench (was 1 mm above it) |
| runner/gram_stain__step02.png | 5069 | flat vessel seated on the bench (was 1 mm above it) |
| runner/gram_stain__step04.png | 7292 | flat vessel seated on the bench (was 1 mm above it) |
| runner/gram_stain__step05.png | 6097 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); flat vessel seated on the bench (was 1 mm above it); pour bottle cap on its ring |
| runner/gram_stain__step07.png | 7983 | flat vessel seated on the bench (was 1 mm above it) |
| runner/gram_stain__step08.png | 5055 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); flat vessel seated on the bench (was 1 mm above it); pour bottle cap on its ring |
| runner/gram_stain__step09.png | 15413 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); flat vessel seated on the bench (was 1 mm above it); pour bottle cap on its ring |
| runner/gram_stain__step10.png | 5055 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); flat vessel seated on the bench (was 1 mm above it); pour bottle cap on its ring |
| runner/gram_stain__step12.png | 8570 | flat vessel seated on the bench (was 1 mm above it) |
| runner/gram_stain__step13.png | 8272 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); flat vessel seated on the bench (was 1 mm above it); pour bottle cap on its ring |
| runner/gram_stain__step14.png | 21286 | flat vessel seated on the bench (was 1 mm above it); vessel rests on the stage clear of the arm / lens; pour bottle cap on its ring |
| runner/neutrophil_rna__step02.png | 10340 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample) |
| runner/neutrophil_rna__step03.png | 21357 | tube lowered into its rotor slot and resting there before Start (was: hovering over the open rotor) |
| runner/neutrophil_rna__step04.png | 10339 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample) |
| runner/neutrophil_rna__step05.png | 26883 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample) |
| runner/neutrophil_rna__step06.png | 18193 | tube lowered into its rotor slot and resting there before Start (was: hovering over the open rotor) |
| runner/neutrophil_rna__step07.png | 10341 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample) |
| runner/neutrophil_rna__step08.png | 18153 | tube lowered into its rotor slot and resting there before Start (was: hovering over the open rotor) |
| runner/neutrophil_rna__step09.png | 10494 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample) |
| runner/neutrophil_rna__step10.png | 8874 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample) |
| runner/neutrophil_rna__step12.png | 10342 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample) |
| runner/neutrophil_rna__step13.png | 18152 | tube lowered into its rotor slot and resting there before Start (was: hovering over the open rotor) |
| runner/neutrophil_rna__step14.png | 10346 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample) |
| runner/neutrophil_rna__step15.png | 18151 | tube lowered into its rotor slot and resting there before Start (was: hovering over the open rotor) |
| runner/neutrophil_rna__step16.png | 10343 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample) |
| runner/neutrophil_rna__step17.png | 18153 | tube lowered into its rotor slot and resting there before Start (was: hovering over the open rotor) |
| runner/neutrophil_rna__step18.png | 3736 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample) |
| runner/neutrophil_rna__step19.png | 18157 | tube lowered into its rotor slot and resting there before Start (was: hovering over the open rotor) |
| runner/neutrophil_rna__step20.png | 10338 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample) |
| runner/neutrophil_rna__step22.png | 10980 | tube lowered into its rotor slot and resting there before Start (was: hovering over the open rotor) |
| runner/passaging__step02.png | 279 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); stand moved left, clear of the plate/flask it stood under |
| runner/passaging__step03.png | 26442 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); stand moved left, clear of the plate/flask it stood under |
| runner/passaging__step04.png | 279 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); stand moved left, clear of the plate/flask it stood under |
| runner/passaging__step05.png | 26453 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); stand moved left, clear of the plate/flask it stood under |
| runner/passaging__step08.png | 36944 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); stand moved left, clear of the plate/flask it stood under; vessel rests on the stage clear of the arm / lens |
| runner/passaging__step09.png | 94345 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); stand moved left, clear of the plate/flask it stood under |
| runner/passaging__step11.png | 10340 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample) |
| runner/passaging__step12.png | 21270 | flat vessel seated on the bench (was 1 mm above it); vessel rests on the stage clear of the arm / lens |
| runner/passaging__step13.png | 26432 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); stand moved left, clear of the plate/flask it stood under |
| runner/pcr__step01.png | 45421 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample) |
| runner/pcr__step02.png | 240 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample) |
| runner/pcr__step03.png | 24493 | tube lowered into its rotor slot and resting there before Start (was: hovering over the open rotor) |
| runner/pcr__step05.png | 354 | sample arrives by an eased trip (lift, carry, lower) and the step waits for it |
| runner/pcr__step08.png | 54690 | gel seated on the tank floor; set back on its bench spot after the run |
| runner/transformation__step02.png | 10336 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample) |
| runner/transformation__step06.png | 10321 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample) |
| runner/transformation__step08.png | 12160 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); spreader comes down from above the frame and leaves; hidden at rest |
| runner/western__step01.png | 44734 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample) |
| runner/western__step02.png | 54679 | gel seated on the tank floor; set back on its bench spot after the run |
| runner/western__step03.png | 5674 | flat vessel seated on the bench (was 1 mm above it) |
| runner/western__step04.png | 15989 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); flat vessel seated on the bench (was 1 mm above it) |
| runner/western__step05.png | 5937 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); flat vessel seated on the bench (was 1 mm above it) |
| runner/western__step06.png | 16944 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); flat vessel seated on the bench (was 1 mm above it) |
| runner/western__step08.png | 16987 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); flat vessel seated on the bench (was 1 mm above it); plate rests on the shaker clips (they stood up through it) |
| runner/western__step09.png | 5920 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); flat vessel seated on the bench (was 1 mm above it) |
| runner/western__step10.png | 17261 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); flat vessel seated on the bench (was 1 mm above it) |
| runner/western__step12.png | 16013 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); flat vessel seated on the bench (was 1 mm above it); plate rests on the shaker clips (they stood up through it) |
| runner/western__step13.png | 5938 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); flat vessel seated on the bench (was 1 mm above it) |
| runner/western__step14.png | 18883 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); flat vessel seated on the bench (was 1 mm above it) |
| runner/western__step16.png | 15995 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); flat vessel seated on the bench (was 1 mm above it); plate rests on the shaker clips (they stood up through it) |
| runner/western__step17.png | 5924 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); flat vessel seated on the bench (was 1 mm above it) |
| runner/western__step18.png | 16012 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); flat vessel seated on the bench (was 1 mm above it) |
| runner/western__step20.png | 6897 | pipette waits at its home and every pass starts/ends there (was: tip in the capped source, parked over the sample); flat vessel seated on the bench (was 1 mm above it); plate rests on the shaker clips (they stood up through it) |
| matrix/centrifuge__microtube__p055.png | 3248 | tube lowered into the slot (seated on its floor); stays docked |
| matrix/centrifuge__microtube__p09.png | 26494 | tube lowered into the slot (seated on its floor); stays docked |
| matrix/centrifuge__spin_column__p055.png | 2718 | tube lowered into the slot (seated on its floor); stays docked |
| matrix/centrifuge__spin_column__p09.png | 25804 | tube lowered into the slot (seated on its floor); stays docked |
| matrix/discard__membrane__p055.png | 8429 | pipette pass from/to home |
| matrix/discard__membrane__p09.png | 8599 | pipette pass from/to home |
| matrix/discard__well_plate__p055.png | 205 | pipette pass from/to home |
| matrix/discard__well_plate__p09.png | 321 | pipette pass from/to home |
| matrix/electrophorese__gel__p055.png | 13452 | gel seated on the tank floor; bench spot clear of the tank |
| matrix/electrophorese__gel__p09.png | 13865 | gel seated on the tank floor; bench spot clear of the tank |
| matrix/electrophorese__membrane__p055.png | 8240 | gel seated on the tank floor; bench spot clear of the tank |
| matrix/electrophorese__membrane__p09.png | 8240 | gel seated on the tank floor; bench spot clear of the tank |
| matrix/elute__eluate_tube__p055.png | 1444 | tube lowered into the slot (seated on its floor); stays docked |
| matrix/elute__eluate_tube__p09.png | 25281 | tube lowered into the slot (seated on its floor); stays docked |
| matrix/heat__slide__p055.png | 8298 | flat seat (slide) on the bench |
| matrix/heat__slide__p09.png | 8299 | flat seat (slide) on the bench |
| matrix/incubate_wait__membrane__p055.png | 9329 | shaker plate on its clips / eased orbit; incubator door |
| matrix/incubate_wait__membrane__p09.png | 13587 | shaker plate on its clips / eased orbit; incubator door |
| matrix/incubate_wait__slide__p055.png | 8294 | shaker plate on its clips / eased orbit; incubator door |
| matrix/incubate_wait__slide__p09.png | 8290 | shaker plate on its clips / eased orbit; incubator door |
| matrix/incubate_wait__well_plate__p055.png | 35865 | shaker plate on its clips / eased orbit; incubator door |
| matrix/incubate_wait__well_plate__p09.png | 32796 | shaker plate on its clips / eased orbit; incubator door |
| matrix/measure__gel__p055.png | 18226 | vessel on the stage clear of arm / lens |
| matrix/measure__gel__p09.png | 18171 | vessel on the stage clear of arm / lens |
| matrix/measure__slide__p055.png | 22136 | vessel on the stage clear of arm / lens |
| matrix/measure__slide__p09.png | 22145 | vessel on the stage clear of arm / lens |
| matrix/pipette_mix__microtube__p055.png | 38 | pipette pass from/to home |
| matrix/pipette_mix__microtube__p09.png | 52 | pipette pass from/to home |
| matrix/pipette_mix__well_plate__p055.png | 38 | pipette pass from/to home |
| matrix/pipette_mix__well_plate__p09.png | 52 | pipette pass from/to home |
| matrix/pour_add__dish__p055.png | 7666 | pipette pass from/to home; flat seat / plate clear of the stand |
| matrix/pour_add__dish__p09.png | 6672 | pipette pass from/to home; flat seat / plate clear of the stand |
| matrix/pour_add__flask__p055.png | 18481 | pipette pass from/to home; flat seat / plate clear of the stand |
| matrix/pour_add__flask__p09.png | 30600 | pipette pass from/to home; flat seat / plate clear of the stand |
| matrix/pour_add__membrane__p055.png | 15928 | pipette pass from/to home; flat seat / plate clear of the stand |
| matrix/pour_add__membrane__p09.png | 15032 | pipette pass from/to home; flat seat / plate clear of the stand |
| matrix/pour_add__microtube__p055.png | 7434 | pipette pass from/to home; flat seat / plate clear of the stand |
| matrix/pour_add__microtube__p09.png | 6540 | pipette pass from/to home; flat seat / plate clear of the stand |
| matrix/pour_add__slide__p055.png | 16023 | pipette pass from/to home; flat seat / plate clear of the stand |
| matrix/pour_add__slide__p09.png | 15284 | pipette pass from/to home; flat seat / plate clear of the stand |
| matrix/pour_add__spin_column__p055.png | 6956 | pipette pass from/to home; flat seat / plate clear of the stand |
| matrix/pour_add__spin_column__p09.png | 6447 | pipette pass from/to home; flat seat / plate clear of the stand |
| matrix/pour_add__well_plate__p055.png | 8776 | pipette pass from/to home; flat seat / plate clear of the stand |
| matrix/pour_add__well_plate__p09.png | 8199 | pipette pass from/to home; flat seat / plate clear of the stand |
| matrix/seed__agar_plate__p055.png | 7324 | pipette pass from/to home; spreader choreography (agar) |
| matrix/seed__agar_plate__p09.png | 15751 | pipette pass from/to home; spreader choreography (agar) |
| matrix/seed__dish__p055.png | 7677 | pipette pass from/to home; spreader choreography (agar) |
| matrix/seed__dish__p09.png | 6665 | pipette pass from/to home; spreader choreography (agar) |
| matrix/seed__flask__p055.png | 18477 | pipette pass from/to home; spreader choreography (agar) |
| matrix/seed__flask__p09.png | 30565 | pipette pass from/to home; spreader choreography (agar) |
| matrix/seed__well_plate__p055.png | 8779 | pipette pass from/to home; spreader choreography (agar) |
| matrix/seed__well_plate__p09.png | 8194 | pipette pass from/to home; spreader choreography (agar) |
| matrix/store__cryovial__p055.png | 30028 | freezer door swings out; incubator entry through the door |
| matrix/store__cryovial__p09.png | 73 | freezer door swings out; incubator entry through the door |
| matrix/store__microtube__p055.png | 30030 | freezer door swings out; incubator entry through the door |
| matrix/store__microtube__p09.png | 77 | freezer door swings out; incubator entry through the door |
| matrix/transfer__flask-microtube__p055.png | 7645 | pipette pass from/to home; vessels set side by side clear of the stand |
| matrix/transfer__flask-microtube__p09.png | 6400 | pipette pass from/to home; vessels set side by side clear of the stand |
| matrix/transfer__gel-membrane__p055.png | 8982 | pipette pass from/to home; vessels set side by side clear of the stand |
| matrix/transfer__gel-membrane__p09.png | 8989 | pipette pass from/to home; vessels set side by side clear of the stand |
| matrix/transfer__microtube-cryovial__p055.png | 7787 | pipette pass from/to home; vessels set side by side clear of the stand |
| matrix/transfer__microtube-cryovial__p09.png | 6608 | pipette pass from/to home; vessels set side by side clear of the stand |
| matrix/transfer__microtube-flask__p055.png | 410 | pipette pass from/to home; vessels set side by side clear of the stand |
| matrix/transfer__microtube-flask__p09.png | 6619 | pipette pass from/to home; vessels set side by side clear of the stand |
| matrix/transfer__microtube-gel__p055.png | 7213 | pipette pass from/to home; vessels set side by side clear of the stand |
| matrix/transfer__microtube-gel__p09.png | 6433 | pipette pass from/to home; vessels set side by side clear of the stand |
| matrix/transfer__microtube-slide__p055.png | 15985 | pipette pass from/to home; vessels set side by side clear of the stand |
| matrix/transfer__microtube-slide__p09.png | 15089 | pipette pass from/to home; vessels set side by side clear of the stand |
| matrix/transfer__microtube-spin_column__p055.png | 7076 | pipette pass from/to home; vessels set side by side clear of the stand |
| matrix/transfer__microtube-spin_column__p09.png | 6210 | pipette pass from/to home; vessels set side by side clear of the stand |
| matrix/transfer__microtube-well_plate__p055.png | 9135 | pipette pass from/to home; vessels set side by side clear of the stand |
| matrix/transfer__microtube-well_plate__p09.png | 8235 | pipette pass from/to home; vessels set side by side clear of the stand |
| matrix/transfer__spin_column-eluate_tube__p09.png | 3922 | pipette pass from/to home; vessels set side by side clear of the stand |
| matrix/transfer__well_plate-microtube__p055.png | 7440 | pipette pass from/to home; vessels set side by side clear of the stand |
| matrix/transfer__well_plate-microtube__p09.png | 6270 | pipette pass from/to home; vessels set side by side clear of the stand |

