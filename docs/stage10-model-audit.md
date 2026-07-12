# Stage 10 — Phase 1 model audit (consolidated)

Every model rendered in isolation via `?models=1` (front + iso), with a reference
microtube + bench in shot, and **looked at**. Four parallel auditors + first-hand
review. Grouped below by **root cause**, not per-symptom.

## Root cause A — flat-lying containers modelled with the wrong shape/pose
The biggest identity failures. These objects have a real resting geometry that the
model doesn't honour.

| model | defect | fix |
|---|---|---|
| flask | Reads as an open butter-dish/tray: squat open rectangular tub, thick cyan slab, a fat stub neck in one corner with a bright **red** cap. Not enclosed, not elongated, not a T-flask. | Rebuild as a T-flask: elongated flat body (~2:1) lying on its side, closed top, a **canted vented neck at one top corner**, shallow monolayer of medium on the flat bottom. |
| slide | Reads as a shallow rimmed tray, ~1.6:1 (real ≈3:1), frosted patch in a corner, a stray teal **blob** floating on top. | Rebuild as a thin flat glass slide ~3:1, frosted label band across one **short end**, the sample a thin surface **film** (not a blob). |

## Root cause B — un-restrained colour / glowing bodies (art-direction violation)
"Colour only from liquids/caps; stylized, restrained." Several models inject
saturated non-liquid colour or emit a glow that bleeds onto the bench.

| model | defect | fix |
|---|---|---|
| water_bath | Flat **near-neon cyan** slab, no meniscus, no submerged tube, no temp dial — a cartoon pool, exactly what the brief says to kill. | Muted, translucent water with a meniscus; add a temperature dial; tube half-submerged handled by the contract. Desaturate hard. |
| thermocycler | **Orange glow** blooms from the block onto the bench (glowing body). Lid floats on two tall posts → reads as a gantry/press, not a hinged clamshell. Only 4 wells, one row. | Kill the at-rest glow (drive it only during the heat phase, low). Proper **hinged clamshell lid**. A denser well array. |
| agar_plate | Bed is a **bullseye**: bright yellow ring around a saturated mint centre. | One uniform opaque tan/amber agar bed; muted lawn. |
| ice_bucket | Interior is a solid saturated-**blue** pool (reads as a water dish, dog-bowl silhouette). | Mute the interior to crushed-ice tones; tighten the silhouette to a bucket. (Demo model — light touch only.) |

## Root cause C — missing defining feature
Recognisable-adjacent, but the one cue that names the object is absent.

| model | defect | fix |
|---|---|---|
| spreader | A plain straight glass rod — **no L-bend foot** (the "hockey stick"). Also floats above the bench. | Add the L-bend foot; seat it. |
| cryovial | No **external thread ribs** on the body, no **conical/skirted base**. | Add body thread ribs + a skirted conical standing base. |
| gel_rig | Tank washed-out/insubstantial; electrode **cables float disconnected**, no terminals on the lid. | Solidify the tank; run cables from lid terminals to the power box. |
| freezer | Door **handle** doesn't read; door is a bare recessed panel → generic white box. | Prominent handle + hinge cue. |
| well_plate | Wells **protrude upward as cylinders** (tube-rack look) instead of recessed bores. | Recess the wells into the plate top. |

## Root cause D — gallery-framing artefacts (not model defects)
| model | note |
|---|---|
| pipette | Cropped off the top in the front view — gallery camera, model is fine. |
| pipette_stand | Reads "tall" — demo model, spec says leave unchanged; framing exaggerates it. |
| gel (front) | Wells detach into a floating dashed line only at the flattened front angle; iso is correct. |

## Passes (verified unchanged, per brief)
microtube, spin_column, eluate_tube, dish, membrane, centrifuge, cold_block,
nanodrop, bottle, waste, syringe, staining_tray.

## Status after repair (re-rendered + looked at)
All root-cause-A/B/C items fixed and verified in the gallery:
flask → flat T-flask + canted cap + muted rose medium; slide → thin 3:1 + frosted
end; water_bath → restrained muted basin + temp dial (cartoon killed); thermocycler
→ hinged clamshell lid, denser wells, NO bench glow; agar_plate/slide/membrane/
dish/well_plate/gel → empty at rest; cryovial → external thread + skirted base;
well_plate → opaque body + recessed wells + A1 notch + bigger footprint; gel_rig →
solid tank + electrode terminals + connected cables; freezer → prominent pull
handle + hinges, closed at rest; spreader → L-bend hockey stick seated on the bench;
ice_bucket → muted interior.

## Fix order (by root cause, symptom count each resolves)
1. **A** rebuild flask, slide — 2 high identity failures.
2. **B** restrain water_bath, thermocycler glow/lid, agar_plate, ice_bucket — 2 high + 2 med, kills the art-direction cluster.
3. **C** spreader, cryovial, gel_rig, freezer, well_plate — 1 high + 4 med/low feature gaps.
4. **D** gallery cam only (no model change).
