# Stage 10 — Phase 3 animation audit

Every plausible (action × container) pair — plus the container transitions across the
9 example protocols — driven through `p` in isolation via `?matrix=1`
(`MatrixScene.jsx`, which reuses the runner's real `configureStation`) and captured
headless. Each frame was **looked at** against the eleven defect classes
(intersection, occlusion, teleport, static, collision-of-meaning, floating, wrong
props, stray geometry, scale, clipped-by-UI, art-drift).

## What the contract structurally fixed (verified by render)
- **Dispense point** follows the container: tube → centre; 96-well → the one active
  well; T-flask → the canted neck. No more pipetting at the plate's centre.
- **Empty motion** follows the container: tubes tip; flat vessels (flask, plate,
  membrane, dish) are aspirated at their surface and **never tip**.
- **Seat / flat-vs-upright** from the contract — flat vessels rest on the bench,
  tubes at block height; the incubation block sits behind so the container is visible.
- **Hand-off** between differing containers animates (old lifts out → new settles in).
- **Passaging hero**: the flask's adherent monolayer detaches during incubation.

## Findings — grouped by ROOT CAUSE (two parallel auditors + review)

**Fixed this pass:**
- **Progress ring read as a stray floating "tweezer/loop"** (recurred on every
  incubate_wait frame). → made it a compact UPRIGHT dial (r 0.4) close over the
  sample, filling clockwise. One fix, ~4 symptoms.
- **`heat` warm light bloomed onto the bench** (art-drift, worst on heat__slide). →
  cut the point light to low intensity + short range so it stays near the vessel.
- **Hand-off vessel lifted so high it clipped the frame top** on transition frames.
  → LIFT 3.2 → 2.0 (stays in frame). The hand-off itself was working (old lifts
  out → new settles in, verified); the single p=0.15 snapshots just caught the new
  vessel mid-descent, which reads odd frozen but animates correctly.
- **`vortex_mix` had NO device** (a bare tube shaking on the bench). → added
  `buildVortexMixer`; the tube now presses into its rubber cup and shakes.

**Not fixed — stated plainly:**
- **`transfer` is hard-wired tube→spin-column.** A `transfer` whose destination is
  a cryovial (cryopreservation) or eluate tube shows the column, not the real
  destination vessel. The generalized hand-off wrapper deliberately excludes
  `transfer` (it has its own choreography), so this pairing is wrong. Needs the
  transfer branch rebuilt on the contract.
- **Equipment generalisation stand-ins:** a 96-well plate incubated on a tube block,
  or "measured" on a NanoDrop, or a flask on a tube block — clip-free and visible,
  but the device is a stand-in for the right instrument (plate incubator / plate
  reader / CO₂ incubator).
- Minor/pre-existing: centrifuge rotor-slot tube clip; tip-discard tube sits a touch
  high; petri-dish medium slightly emissive; the agar spreader only appears at
  p>0.55 (so a p=0.5 frame shows none — correct by timing, not a defect).

## Follow-up round — the three remaining gaps are now CLOSED
- **transfer** is no longer hard-wired tube→spin_column. It is now just an A→B move
  whose destination comes from the sample-follow sequence, played by the shared
  hand-off wrapper. Verified: RNA → spin_column, cryopreservation → cryovial,
  passaging → tube — each the correct destination, none hardcoded.
- **Equipment side of the contract** (`INSTRUMENTS` + `resolveInstrument`): each
  instrument declares which containers it accepts. Built the missing ones —
  `plate_reader` (ELISA, NOT the NanoDrop), `plate_shaker` (plate/membrane
  incubation), `co2_incubator` (flasks, glass door + shelves). No valid instrument →
  BENCH fallback (never a wrong instrument). Verified: well-plate incubates on the
  shaker, flask in the CO₂ incubator, well-plate reads on the plate reader, slide
  incubation and flask "measure" fall back to the bench.
- **Angled neck approach**: the pipette now tilts and descends into the flask's
  canted neck along its axis. **Thermocycler lid** now closes flat over the block
  during cycling (tube sunk so only the cap sits near the block top; closed lid
  clears it). Both verified by render.
