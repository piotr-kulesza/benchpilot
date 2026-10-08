# Station-change transition: e972bcf vs polish

The transition (the camera's dolly and the vessels' glide to the next station) is e972bcf's code, taken
literally. The only change is ONE factor, `TRANSITION_SLOWDOWN = 1.6` (`web/frontend/src/scene/tempo.js`).
It applies to the camera, the vessels and the station fade together.

## Method

`scripts/transition-record.mjs` recorded every transition of three protocols on both builds. Each
transition: deep link to station k, let it settle (a timed station rests, its countdown not started),
press Next, then record every frame:
- the camera: position, quaternion, FOV;
- every travelling vessel: position, plus its goal this frame.

The recorder works the same way on both builds:
- **Frame clock:** mocked `performance.now` and `requestAnimationFrame`.
- **Frame rate:** e972bcf is stepped at 96 fps and polish at 60 fps, so frame n of both is the same
  moment of normalised time (polish time ÷ 1.6).
- **Sway phase:** the renderer clock is set to the same normalised moment at Next (T = 1000 s), so the
  camera's sway starts in phase.

`scripts/transition-diff.mjs` compares the recordings frame by frame, tolerance 1e-3.

How to read the columns:
- **Camera offset (constant):** an offset that is the same at every frame is where the camera ends up,
  that is, the new station's measured framing. It is reported apart from the camera's motion.
- **Glide law residual:** checks, in each build separately, that every frame of every free vessel obeys
  e972bcf's glide, `pos(n+1) = pos(n) + (goal − pos(n))·(1 − 0.02^(1/96))`.

## Result

- **Camera motion:** within 1e-3 on all 40 transitions; quaternion and FOV identical (Δ < 1e-6). The
  remaining camera Δ (≤ 4.5e-4) is the sway clock's phase.
- **Constant camera offsets:** the camera ends up framed differently wherever the transition arrives
  at a station whose CONTENT changed since e972bcf. Its framing is measured from that content
  (`computeStationFrame`, unchanged since e972bcf):
  - every centrifuge station: Δy +0.632, Δz −0.315 (hollow shell, rotor holes);
  - the thermocycler (pcr 4 → 5): Δy +0.355, Δz −0.065 (its sample well);
  - plating the transformation (7 → 8): Δx +0.133, Δz +0.033 (now a pipette transfer from the tube).

  This is the station's framing, not the transition.
- **Vessels' glide law:** e972bcf's within 1e-6 on every frame in both builds (≈ 5,000 moving frames
  per protocol).
- **Absolute vessel positions:** match where both builds hand the transition the same start and seat.
  Where they differ, the cause is the station on either side, not the glide:
  - **Where the previous station left the vessel:** e.g. e972bcf's centrifuge at rest leaves the tube
    hovering over the rotor, while polish lowers it into the slot. So the polish tube first rises out
    (e972bcf's own exit lift), then glides.
  - **The seat the next station gives it:** these were re-seated from geometry since e972bcf, e.g.
    the water bath's liner floor (transformation 3 → 4 and 4 → 5, 0.02).
  - **Which vessels the stations show:** plating now shows the tube and the plate side by side; the gel
    in pcr 7 → 8.

## Which differences are which, transition by transition

In the tables below:
- **✗ in the vessel column with a glide-law residual of 0:** the glide itself is e972bcf's; the
  vessel starts or ends somewhere else, given by the stations on either side.
- **✗ in the camera column with a constant offset listed:** the arriving station's framing differs;
  the camera's motion column is the transition itself.


### neutrophil_rna

| transition | frames | camera pos max Δ | of it, the station's framing (constant) | camera motion Δ (framing taken out) | quaternion Δ | FOV Δ | vessels: max Δ (at start / at end) | glide law residual e972bcf / polish |
|---|---|---|---|---|---|---|---|---|
| 1 → 2 | 384 | 3.3e-4 ✓ | – | 9.7e-5 ✓ | 0 ✓ | 0 ✓ | tube 9.9e-4 (0 / 1.0e-6) ✓ | 0 / 0 ✓ |
| 2 → 3 | 384 | 0.632 ✗ | 0.000, 0.632, -0.315 | 9.6e-5 ✓ | 0 ✓ | 0 ✓ | tube 0.969 (0 / 0.969) ✗ | 0 / 0 ✓ |
| 3 → 4 | 384 | 3.3e-4 ✓ | – | 9.7e-5 ✓ | 0 ✓ | 0 ✓ | tube 6.708 (1.256 / 1.0e-6) ✗ | 0 / 0 ✓ |
| 4 → 5 | 384 | 3.3e-4 ✓ | – | 9.7e-5 ✓ | 0 ✓ | 0 ✓ | tube 0 (0 / 0); column 0 (0 / 0) ✓ | 0 / 0 ✓ |
| 5 → 6 | 384 | 0.632 ✗ | 0.000, 0.632, -0.315 | 9.6e-5 ✓ | 0 ✓ | 0 ✓ | column 1.192 (0 / 1.192) ✗ | 0 / 0 ✓ |
| 6 → 7 | 384 | 3.3e-4 ✓ | – | 9.7e-5 ✓ | 0 ✓ | 0 ✓ | column 6.708 (1.256 / 1.000) ✗ | 0 / 0 ✓ |
| 7 → 8 | 384 | 0.632 ✗ | 0.000, 0.632, -0.315 | 9.6e-5 ✓ | 0 ✓ | 0 ✓ | column 1.134 (0 / 1.134) ✗ | 0 / 0 ✓ |
| 8 → 9 | 384 | 3.3e-4 ✓ | – | 9.7e-5 ✓ | 0 ✓ | 0 ✓ | column 4.946 (0.200 / 1.000); prep:undefined shown in e972bcf only; prep:dnase_mix shown in polish only ✗ | 0 / 0 ✓ |
| 9 → 10 | 384 | 3.3e-4 ✓ | – | 9.7e-5 ✓ | 0 ✓ | 0 ✓ | column 1.0e-3 (0 / 2.0e-6); prep:undefined shown in e972bcf only; prep:dnase_mix shown in polish only ✗ | 0 / 0 ✓ |
| 10 → 11 | 384 | 3.3e-4 ✓ | – | 9.7e-5 ✓ | 0 ✓ | 0 ✓ | column 9.9e-4 (0 / 0) ✓ | 0 / 0 ✓ |
| 11 → 12 | 384 | 3.3e-4 ✓ | – | 9.7e-5 ✓ | 0 ✓ | 0 ✓ | column 9.9e-4 (0 / 1.0e-6) ✓ | 0 / 0 ✓ |
| 12 → 13 | 384 | 0.632 ✗ | 0.000, 0.632, -0.315 | 9.6e-5 ✓ | 0 ✓ | 0 ✓ | column 1.134 (0 / 1.134) ✗ | 0 / 0 ✓ |
| 13 → 14 | 384 | 3.3e-4 ✓ | – | 9.7e-5 ✓ | 0 ✓ | 0 ✓ | column 6.708 (1.256 / 1.000) ✗ | 0 / 0 ✓ |
| 14 → 15 | 384 | 0.632 ✗ | 0.000, 0.632, -0.315 | 9.6e-5 ✓ | 0 ✓ | 0 ✓ | column 1.134 (0 / 1.134) ✗ | 0 / 0 ✓ |
| 15 → 16 | 384 | 3.3e-4 ✓ | – | 9.7e-5 ✓ | 0 ✓ | 0 ✓ | column 6.708 (1.256 / 0) ✗ | 0 / 0 ✓ |
| 16 → 17 | 384 | 0.632 ✗ | 0.000, 0.632, -0.315 | 9.6e-5 ✓ | 0 ✓ | 0 ✓ | column 1.134 (0 / 1.134) ✗ | 0 / 0 ✓ |
| 17 → 18 | 384 | 3.3e-4 ✓ | – | 9.7e-5 ✓ | 0 ✓ | 0 ✓ | tube 0 (0 / 0); column 6.096 (0.246 / 1.533) ✗ | 0 / 0 ✓ |
| 18 → 19 | 384 | 0.632 ✗ | 0.000, 0.632, -0.315 | 9.6e-5 ✓ | 0 ✓ | 0 ✓ | column 1.174 (0.037 / 1.174) ✗ | 0 / 0 ✓ |
| 19 → 20 | 384 | 0.002 ✗ | 0.001, 0.000, 0.000 | 4.5e-4 ✓ | 0 ✓ | 0 ✓ | column 6.708 (1.256 / 0) ✗ | 0 / 0 ✓ |
| 20 → 21 | 384 | 4.4e-4 ✓ | – | 1.3e-4 ✓ | 0 ✓ | 0 ✓ | column 9.9e-4 (0 / 0) ✓ | 0 / 0 ✓ |
| 21 → 22 | 384 | 0.632 ✗ | 0.001, 0.632, -0.315 | 2.9e-4 ✓ | 0 ✓ | 0 ✓ | elu 0.569 (0 / 0.569) ✗ | 0 / 0 ✓ |
| 22 → 23 | 384 | 9.9e-4 ✓ | – | 2.9e-4 ✓ | 0 ✓ | 0 ✓ | elu 5.367 (1.256 / 1.592) ✗ | 0 / 0 ✓ |
| 23 → 24 | 384 | 1.1e-4 ✓ | – | 3.3e-5 ✓ | 0 ✓ | 0 ✓ | elu 0.192 (0.192 / 0) ✗ | 0 / 0 ✓ |
| 24 → 25 | 384 | 9.9e-4 ✓ | – | 2.9e-4 ✓ | 0 ✓ | 0 ✓ | elu 9.8e-4 (0 / 2.0e-6) ✓ | 0 / 0 ✓ |
| 25 → 26 | 384 | 9.9e-4 ✓ | – | 2.9e-4 ✓ | 0 ✓ | 0 ✓ | elu 9.9e-4 (0 / 0) ✓ | 0 / 0 ✓ |

camera motion within 0.001 on every transition: yes · the vessels' glide is e972bcf's law within 0.001 on every frame: yes · everything (camera incl. framing, vessels) within 0.001: NO

### pcr

| transition | frames | camera pos max Δ | of it, the station's framing (constant) | camera motion Δ (framing taken out) | quaternion Δ | FOV Δ | vessels: max Δ (at start / at end) | glide law residual e972bcf / polish |
|---|---|---|---|---|---|---|---|---|
| 1 → 2 | 384 | 3.3e-4 ✓ | – | 9.7e-5 ✓ | 0 ✓ | 0 ✓ | tube 1.0e-3 (0 / 2.0e-6) ✓ | 0 / 0 ✓ |
| 2 → 3 | 384 | 0.632 ✗ | 0.000, 0.632, -0.315 | 9.6e-5 ✓ | 0 ✓ | 0 ✓ | tube 1.357 (0 / 0.069) ✗ | 0 / 0 ✓ |
| 3 → 4 | 384 | 3.3e-4 ✓ | – | 9.7e-5 ✓ | 0 ✓ | 0 ✓ | tube 6.708 (1.256 / 1.0e-6) ✗ | 0 / 0 ✓ |
| 4 → 5 | 384 | 0.355 ✗ | 0.000, 0.355, -0.065 | 9.7e-5 ✓ | 0 ✓ | 0 ✓ | tube 9.9e-4 (0 / 1.0e-6) ✓ | 0 / 0 ✓ |
| 5 → 6 | 384 | 3.3e-4 ✓ | – | 9.7e-5 ✓ | 0 ✓ | 0 ✓ | tube 9.9e-4 (0 / 0) ✓ | 0 / 0 ✓ |
| 6 → 7 | 384 | 3.3e-4 ✓ | – | 9.7e-5 ✓ | 0 ✓ | 0 ✓ | tube 9.9e-4 (0 / 0) ✓ | 0 / 0 ✓ |
| 7 → 8 | 384 | 3.3e-4 ✓ | – | 9.7e-5 ✓ | 0 ✓ | 0 ✓ | tube shown in polish only; gel shown in e972bcf only ✗ | 0 / 0 ✓ |

camera motion within 0.001 on every transition: yes · the vessels' glide is e972bcf's law within 0.001 on every frame: yes · everything (camera incl. framing, vessels) within 0.001: NO

### transformation

| transition | frames | camera pos max Δ | of it, the station's framing (constant) | camera motion Δ (framing taken out) | quaternion Δ | FOV Δ | vessels: max Δ (at start / at end) | glide law residual e972bcf / polish |
|---|---|---|---|---|---|---|---|---|
| 1 → 2 | 384 | 3.3e-4 ✓ | – | 9.7e-5 ✓ | 0 ✓ | 0 ✓ | tube 9.9e-4 (0 / 1.0e-6) ✓ | 0 / 0 ✓ |
| 2 → 3 | 384 | 3.3e-4 ✓ | – | 9.7e-5 ✓ | 0 ✓ | 0 ✓ | tube 9.9e-4 (0 / 1.0e-6) ✓ | 0 / 0 ✓ |
| 3 → 4 | 384 | 3.3e-4 ✓ | – | 9.7e-5 ✓ | 0 ✓ | 0 ✓ | tube 0.020 (8.0e-4 / 0.020) ✗ | 0 / 0 ✓ |
| 4 → 5 | 384 | 3.3e-4 ✓ | – | 9.7e-5 ✓ | 0 ✓ | 0 ✓ | tube 0.019 (0.019 / 1.0e-6) ✗ | 0 / 0 ✓ |
| 5 → 6 | 384 | 3.3e-4 ✓ | – | 9.7e-5 ✓ | 0 ✓ | 0 ✓ | tube 9.9e-4 (0 / 0) ✓ | 0 / 0 ✓ |
| 6 → 7 | 384 | 3.3e-4 ✓ | – | 9.7e-5 ✓ | 0 ✓ | 0 ✓ | tube 9.9e-4 (0 / 0) ✓ | 0 / 0 ✓ |
| 7 → 8 | 384 | 0.133 ✗ | 0.133, 0.000, 0.033 | 9.6e-5 ✓ | 0 ✓ | 0 ✓ | tube shown in polish only; agarplate shown in polish only ✗ | 0 / 0 ✓ |
| 8 → 9 | 384 | 3.3e-4 ✓ | – | 9.7e-5 ✓ | 0 ✓ | 0 ✓ | agarplate 1.152 (1.152 / 0) ✗ | 0 / 0 ✓ |

camera motion within 0.001 on every transition: yes · the vessels' glide is e972bcf's law within 0.001 on every frame: yes · everything (camera incl. framing, vessels) within 0.001: NO


## Collisions of the restored glide (point 4 — not fixed, for Piotr to decide)

The collision audit (`npm run check-protocol -- --examples`) finds these, all during a station change. e972bcf glides a vessel in a straight line toward its seat (only a docked one lifts straight up first), so it passes through what stands between. Every station itself is clean: no collision after the step has started. Depth = how far the solids overlap (world units); “swept through” = its path crosses the object between two frames.

| protocol | transition | vessel | passes through |
|---|---|---|---|
| agarose_gel | 1 → 2 | Flask | the last station’s bottle (overlap 0.67, swept through) |
| agarose_gel | 3 → 4 | Flask | this station’s PipetteStand (overlap 0.09, swept through) |
| agarose_gel | 4 → 5 | GelSlab | the last station’s PipetteStand (overlap 0.05, swept through); the last station’s bottle (swept through); the Flask (swept through) |
| agarose_gel | 4 → 5 | Flask | the GelSlab (overlap 0.21) |
| agarose_gel | 11 → 12 | GelSlab | the last station’s GelRig (overlap 0.22, swept through); this station’s UVTransilluminator (overlap 0.05, swept through) |
| cryopreservation | 6 → 7 | Cryovial | the last station’s Freezer (overlap 0.04, swept through) |
| elisa | 2 → 3 | Tube | the last station’s Centrifuge (overlap 0.41, swept through) |
| elisa | 4 → 5 | prep Tube | the last station’s bottle (swept through); the Tube (swept through) |
| elisa | 4 → 5 | Tube | the prep Tube (overlap 0.06) |
| elisa | 5 → 6 | WellPlate | this station’s PlateShaker (overlap 0.10, swept through) |
| elisa | 6 → 7 | WellPlate | the last station’s PlateShaker (overlap 0.09, swept through) |
| elisa | 7 → 8 | WellPlate | this station’s PipetteStand (overlap 0.11, swept through) |
| elisa | 8 → 9 | WellPlate | the last station’s waste beaker (overlap 0.11, swept through); this station’s PipetteStand (overlap 0.11, swept through) |
| elisa | 9 → 10 | WellPlate | the last station’s bottle (overlap 0.11, swept through); this station’s PlateShaker (overlap 0.10, swept through) |
| elisa | 11 → 12 | WellPlate | the last station’s bottle (overlap 0.08, swept through); this station’s PipetteStand (overlap 0.11, swept through) |
| elisa | 11 → 12 | prep Tube | the last station’s bottle (swept through) |
| elisa | 12 → 13 | WellPlate | this station’s PlateShaker (overlap 0.10, swept through) |
| elisa | 13 → 14 | WellPlate | the last station’s PlateShaker (overlap 0.09, swept through) |
| elisa | 14 → 15 | WellPlate | this station’s PipetteStand (overlap 0.11, swept through) |
| elisa | 15 → 16 | WellPlate | the last station’s waste beaker (overlap 0.11, swept through); this station’s PipetteStand (overlap 0.11, swept through) |
| elisa | 16 → 17 | WellPlate | the last station’s bottle (overlap 0.08, swept through) |
| elisa | 18 → 19 | WellPlate | this station’s PipetteStand (overlap 0.11, swept through) |
| elisa | 19 → 20 | WellPlate | the last station’s waste beaker (overlap 0.11, swept through); this station’s PipetteStand (overlap 0.11, swept through) |
| elisa | 20 → 21 | WellPlate | the last station’s bottle (overlap 0.08, swept through) |
| elisa | 22 → 23 | WellPlate | this station’s PipetteStand (overlap 0.11, swept through) |
| elisa | 23 → 24 | WellPlate | the last station’s waste beaker (overlap 0.11, swept through); this station’s PipetteStand (overlap 0.11, swept through) |
| elisa | 24 → 25 | WellPlate | the last station’s bottle (overlap 0.11, swept through); this station’s PlateShaker (overlap 0.10, swept through) |
| elisa | 25 → 26 | WellPlate | the last station’s PlateShaker (overlap 0.09, swept through); this station’s PipetteStand (overlap 0.06, swept through) |
| elisa | 26 → 27 | WellPlate | the last station’s bottle (overlap 0.07, swept through); this station’s PlateReader (overlap 0.08, swept through) |
| gram_stain | 13 → 14 | Slide | this station’s LightMicroscope (overlap 0.03, swept through) |
| neutrophil_rna | 1 → 2 | Tube | the last station’s IceBucket (overlap 1.44, swept through) |
| neutrophil_rna | 3 → 4 | Tube | the last station’s Centrifuge (overlap 0.41, swept through) |
| neutrophil_rna | 6 → 7 | SpinColumn | the last station’s Centrifuge (overlap 0.29, swept through); this station’s waste beaker (overlap 0.69, swept through) |
| neutrophil_rna | 8 → 9 | SpinColumn | this station’s waste beaker (overlap 0.76, swept through) |
| neutrophil_rna | 9 → 10 | prep Tube | the last station’s bottle (swept through) |
| neutrophil_rna | 13 → 14 | SpinColumn | the last station’s Centrifuge (overlap 0.29, swept through); this station’s waste beaker (overlap 0.69, swept through) |
| neutrophil_rna | 15 → 16 | SpinColumn | the last station’s Centrifuge (overlap 0.29, swept through) |
| neutrophil_rna | 19 → 20 | SpinColumn | the last station’s Centrifuge (overlap 0.29, swept through) |
| neutrophil_rna | 22 → 23 | Tube | the last station’s Centrifuge (overlap 0.30, swept through) |
| neutrophil_rna | 23 → 24 | Tube | the last station’s Freezer (overlap 0.02, swept through) |
| neutrophil_rna | 24 → 25 | Tube | the last station’s NanoDrop (overlap 0.10, swept through) |
| passaging | 2 → 3 | Flask | this station’s PipetteStand (overlap 0.09, swept through) |
| passaging | 3 → 4 | Flask | the last station’s bottle (overlap 0.69, swept through); this station’s PipetteStand (overlap 0.09, swept through) |
| passaging | 4 → 5 | Flask | the last station’s waste beaker (overlap 0.24, swept through); this station’s PipetteStand (overlap 0.09, swept through) |
| passaging | 5 → 6 | Flask | the last station’s bottle (overlap 0.69, swept through) |
| passaging | 6 → 7 | Flask | this station’s InvertedMicroscope (overlap 0.21, swept through) |
| passaging | 7 → 8 | Flask | the last station’s InvertedMicroscope (overlap 0.08, swept through); this station’s PipetteStand (overlap 0.13, swept through) |
| passaging | 13 → 14 | Flask | this station’s CO₂ incubator (overlap 0.29, swept through) |
| pcr | 1 → 2 | Tube | the last station’s bottle (overlap 0.30, swept through) |
| pcr | 3 → 4 | Tube | the last station’s Centrifuge (overlap 0.41, swept through) |
| pcr | 4 → 5 | Tube | this station’s Thermocycler (overlap 0.35, swept through) |
| transformation | 1 → 2 | Tube | the last station’s IceBucket (overlap 1.44, swept through) |
| transformation | 2 → 3 | Tube | the last station’s bottle (overlap 0.36, swept through); this station’s IceBucket (overlap 1.44, swept through) |
| transformation | 3 → 4 | Tube | the last station’s IceBucket (overlap 1.45, swept through); this station’s WaterBath (overlap 0.91, swept through) |
| transformation | 4 → 5 | Tube | the last station’s WaterBath (swept through); this station’s IceBucket (overlap 1.44, swept through) |
| transformation | 5 → 6 | Tube | the last station’s IceBucket (overlap 1.44, swept through) |
| western | 3 → 4 | Membrane | this station’s PipetteStand (overlap 0.03, swept through) |
| western | 4 → 5 | Membrane | the last station’s bottle (overlap 0.01, swept through); this station’s PipetteStand (overlap 0.03, swept through) |
| western | 5 → 6 | Membrane | the last station’s waste beaker (overlap 0.01, swept through); this station’s PipetteStand (overlap 0.03, swept through) |
| western | 6 → 7 | Membrane | the last station’s bottle (swept through); this station’s PlateShaker (overlap 0.06, swept through) |
| western | 7 → 8 | Membrane | the last station’s PlateShaker (overlap 0.04, swept through) |
| western | 8 → 9 | Membrane | the last station’s bottle (overlap 0.01, swept through); this station’s PipetteStand (overlap 0.03, swept through) |
| western | 9 → 10 | Membrane | the last station’s waste beaker (overlap 0.01, swept through); this station’s PipetteStand (overlap 0.03, swept through) |
| western | 10 → 11 | Membrane | the last station’s bottle (swept through); this station’s PlateShaker (overlap 0.06, swept through) |
| western | 11 → 12 | Membrane | the last station’s PlateShaker (overlap 0.04, swept through) |
| western | 12 → 13 | Membrane | the last station’s bottle (overlap 0.01, swept through); this station’s PipetteStand (overlap 0.03, swept through) |
| western | 13 → 14 | Membrane | the last station’s waste beaker (overlap 0.01, swept through); this station’s PipetteStand (overlap 0.03, swept through) |
| western | 14 → 15 | Membrane | the last station’s bottle (swept through); this station’s PlateShaker (overlap 0.06, swept through) |
| western | 15 → 16 | Membrane | the last station’s PlateShaker (overlap 0.04, swept through) |
| western | 16 → 17 | Membrane | the last station’s bottle (overlap 0.01, swept through); this station’s PipetteStand (overlap 0.03, swept through) |
| western | 17 → 18 | Membrane | the last station’s waste beaker (overlap 0.01, swept through); this station’s PipetteStand (overlap 0.03, swept through) |
| western | 18 → 19 | Membrane | the last station’s bottle (swept through); this station’s PlateShaker (overlap 0.06, swept through) |
| western | 19 → 20 | Membrane | the last station’s PlateShaker (overlap 0.04, swept through) |

73 station changes across the 9 examples. Also red by the audit, by construction of e972bcf’s glide: a vessel’s first frames run above the global speed cap and start at full speed (an exponential ease), and the camera is no longer held to the cap.
