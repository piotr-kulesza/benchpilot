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

## Known remaining gaps (stated plainly)
- **Angled pipette approach** into a flask neck is declared in the contract but not
  yet wired — the pipette still descends straight down onto the neck (no clip, but
  not angled).
- **Thermocycler lid** stays raised during cycling (clip-free) rather than closing
  over the cap — a full closed-lid-over-cap requires sinking the tube so only the cap
  shows; deferred.
- **Equipment generalisation**: a T-flask incubated beside a dry tube-block reads
  slightly oddly (a real flask goes in a CO₂ incubator) — clip-free and visible, but
  the block is a stand-in.
