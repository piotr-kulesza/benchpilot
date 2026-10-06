# Liquids — every volume from the protocol (branch `polish`)

One ledger (`web/frontend/src/vessel/liquidLedger.js`) says how much liquid every vessel holds at the
start and end of every station; the scene draws exactly that. Rules: CLAUDE.md "Liquid ledger".
Full per-station ledger with every flag: [`liquid-ledger.md`](liquid-ledger.md)
(`npx vite-node scripts/liquid-report.mjs`).

## Proofs (`src/vessel/liquidLedger.test.js`)

Shown red first: the ledger module was first committed as the scene's CURRENT chain, extracted
verbatim (7f5f07a) — **32 of 42 failed**: conservation in 9/9 protocols, continuity in 8/9,
doubling (100 µl + 100 µl stayed 293 µl), the tip (a 0.3 µl draw drew 116 µl), the neutrophil
volumes, the unstated-volume report. (The 9 per-protocol tip checks passed vacuously there: the old
chain recorded no passes; the synthetic tip check was red.)

Now **78 / 78 green** — every protocol run twice (all steps; the runner's stations):

- conservation: each station's ops replayed on its start give its end; totals change only by
  explicit adds, discards and set-asides;
- continuity: volume and colour at the end of station n = start of n+1, every vessel;
- doubling: 100 µl + 100 µl = exactly 200 µl, and the drawn liquid MESH (the tube builder's own lathe)
  holds the ledger volume within 2 %;
- the tip: a 0.3–200 µl draw fills the drawn tip to that volume (±2 %); no pass draws more than one
  200 µl tip; no tip holds more than it drew;
- neutrophil: 350 → 700 µl (one volume) → column 700 µl → flow-through 700 µl, discarded → … →
  40 µl eluate (30–50 µl midpoint);
- every station with an unstated reagent volume carries a flag.

Full suite: 458 passed.

## The liquid sheet (neutrophil_rna)

`docs/liquid-sheet/neutrophil_rna-{1,2,3}.jpg` — all 26 stations at start, middle (p = 0.5) and end, with
the volume the scene DRAWS (read back through each vessel's drawn shape) and the ledger's volume under
each tile. Start and end: **0 mismatches** (all within 2 %). Mid-step the sum is conserved in transit
(station 5 mid-transfer: tube 350 + column 348 + tip ≈ 700 µl).
Regenerate: `node scripts/liquid-sheet.mjs` (dev server) then `python3 scripts/liquid-sheet-compose.py`.

## Tiles (pre-liquid `current` → `liquid`, same machine)

Models 64/64 and matrix 104/104 pixel-identical. Runner: 38 identical, 99 changed — every changed
tile shows a liquid that changed (or, for the 4 western tiles at the frame edge, a neighbouring
station's liquid handling). The dev matrix has no ledger and keeps the demo's levels.

Collisions (neutrophil, same audit): 17 → 17 collision-red stations, 0 → 0 motion-red; the only new
findings are two frame-0, single-frame floats (stations 19, 22) — the class the comparison excludes.

| station | action | px | why |
|---|---|---|---|
| agarose_gel 1 | pour_add | 54892 | add pour — volumes from the ledger |
| agarose_gel 2 | heat | 29557 | holds flask — level now from the ledger volume |
| agarose_gel 3 | incubate_wait | 29557 | holds flask — level now from the ledger volume |
| agarose_gel 4 | pour_add | 29414 | add pipette — volumes from the ledger |
| agarose_gel 8 | pour_add | 10911 | add pipette — volumes from the ledger |
| agarose_gel 9 | transfer | 305 | move pipette — volumes from the ledger |
| cryopreservation 1 | generic | 14197 | holds tube — level now from the ledger volume |
| cryopreservation 2 | centrifuge | 14197 | holds tube — level now from the ledger volume |
| cryopreservation 3 | discard | 611 | discard — volumes from the ledger |
| cryopreservation 4 | pour_add | 4334 | add pipette — volumes from the ledger |
| cryopreservation 5 | transfer | 3571 | move pipette — volumes from the ledger |
| cryopreservation 7 | store | 3235 | holds cryovial — level now from the ledger volume |
| elisa 1 | pour_add | 2656 | add collect — volumes from the ledger |
| elisa 3 | transfer | 767 | holds tube — level now from the ledger volume |
| elisa 4 | prepare | 26250 | add pipette, add pipette — volumes from the ledger |
| elisa 5 | pour_add | 6671 | move pipette — volumes from the ledger |
| elisa 6 | incubate_wait | 40 | holds tube/wellplate — level now from the ledger volume |
| elisa 7 | pour_add | 1935 | add pipette — volumes from the ledger |
| elisa 8 | discard | 212 | discard — volumes from the ledger |
| elisa 9 | pour_add | 1873 | add pipette — volumes from the ledger |
| elisa 11 | prepare | 6706 | add pipette — volumes from the ledger |
| elisa 12 | pour_add | 4460 | move pipette — volumes from the ledger |
| elisa 13 | incubate_wait | 25 | holds tube/wellplate — level now from the ledger volume |
| elisa 14 | pour_add | 1944 | add pipette — volumes from the ledger |
| elisa 15 | discard | 212 | discard — volumes from the ledger |
| elisa 16 | pour_add | 1877 | add pipette — volumes from the ledger |
| elisa 18 | pour_add | 1875 | add pipette — volumes from the ledger |
| elisa 19 | discard | 212 | discard — volumes from the ledger |
| elisa 20 | pour_add | 1878 | add pipette — volumes from the ledger |
| elisa 22 | pour_add | 1874 | add pipette — volumes from the ledger |
| elisa 23 | discard | 212 | discard — volumes from the ledger |
| elisa 24 | pour_add | 1878 | add pipette — volumes from the ledger |
| elisa 26 | pour_add | 1877 | add pipette — volumes from the ledger |
| gram_stain 5 | pour_add | 1909 | add pour, discard — volumes from the ledger |
| gram_stain 8 | pour_add | 1910 | add pour, discard — volumes from the ledger |
| gram_stain 9 | pour_add | 1884 | add pipette, discard — volumes from the ledger |
| gram_stain 10 | pour_add | 1910 | add pour, discard — volumes from the ledger |
| gram_stain 13 | pour_add | 1909 | add pour, discard — volumes from the ledger |
| neutrophil_rna 1 | cool_ice | 2465 | the pellet tube is empty (a pellet is a solid; the old 0.3 level was invented liquid) |
| neutrophil_rna 2 | pour_add | 15006 | add pipette — volumes from the ledger |
| neutrophil_rna 4 | pour_add | 17213 | add pipette — volumes from the ledger |
| neutrophil_rna 5 | transfer | 16236 | move pipette — volumes from the ledger |
| neutrophil_rna 6 | centrifuge | 1085 | move spin, discard — volumes from the ledger |
| neutrophil_rna 7 | pour_add | 14570 | add pipette — volumes from the ledger |
| neutrophil_rna 8 | centrifuge | 542 | move spin, discard — volumes from the ledger |
| neutrophil_rna 9 | prepare | 18000 | add pipette, add pipette — volumes from the ledger |
| neutrophil_rna 10 | pour_add | 7747 | move pipette — volumes from the ledger |
| neutrophil_rna 11 | incubate_wait | 1114 | holds column — level now from the ledger volume |
| neutrophil_rna 12 | pour_add | 15174 | add pipette — volumes from the ledger |
| neutrophil_rna 13 | centrifuge | 784 | move spin, discard — volumes from the ledger |
| neutrophil_rna 14 | pour_add | 18669 | add pipette — volumes from the ledger |
| neutrophil_rna 15 | centrifuge | 795 | move spin — volumes from the ledger |
| neutrophil_rna 16 | pour_add | 18665 | add pipette — volumes from the ledger |
| neutrophil_rna 17 | centrifuge | 795 | move spin — volumes from the ledger |
| neutrophil_rna 18 | transfer | 4448 | retire — volumes from the ledger |
| neutrophil_rna 19 | centrifuge | 996 | the column is empty after a dry spin (it used to show liquid) |
| neutrophil_rna 20 | pour_add | 2997 | add pipette — volumes from the ledger |
| neutrophil_rna 21 | incubate_wait | 1114 | holds column — level now from the ledger volume |
| neutrophil_rna 24 | measure | 2884 | holds elu — level now from the ledger volume |
| neutrophil_rna 25 | measure | 2411 | holds elu — level now from the ledger volume |
| neutrophil_rna 26 | measure | 2411 | holds elu — level now from the ledger volume |
| passaging 1 | measure | 961 | holds flask — level now from the ledger volume |
| passaging 2 | discard | 12887 | discard — volumes from the ledger |
| passaging 3 | pour_add | 2999 | add pipette — volumes from the ledger |
| passaging 4 | discard | 12880 | discard — volumes from the ledger |
| passaging 5 | pour_add | 5050 | add pipette — volumes from the ledger |
| passaging 6 | incubate_wait | 3064 | holds flask — level now from the ledger volume |
| passaging 7 | measure | 6543 | holds flask — level now from the ledger volume |
| passaging 8 | pour_add | 3670 | add pipette — volumes from the ledger |
| passaging 9 | transfer | 22317 | move pipette — volumes from the ledger |
| passaging 10 | centrifuge | 9038 | holds tube — level now from the ledger volume |
| passaging 11 | pour_add | 5976 | add pipette — volumes from the ledger |
| passaging 14 | store | 1825 | holds flask — level now from the ledger volume |
| pcr 1 | prepare | 20173 | add pipette, add pipette, add pipette, add pipette, add pipette, add pipette, add pipette — volumes from the ledger |
| pcr 2 | pipette_mix | 2972 | holds tube/prep:pcr_reaction — level now from the ledger volume |
| pcr 4 | heat | 1692 | holds tube/prep:pcr_reaction — level now from the ledger volume |
| pcr 5 | thermocycle | 342 | holds tube/prep:pcr_reaction — level now from the ledger volume |
| pcr 6 | heat | 1692 | holds tube/prep:pcr_reaction — level now from the ledger volume |
| pcr 7 | store | 1692 | holds tube/prep:pcr_reaction — level now from the ledger volume |
| transformation 1 | cool_ice | 2466 | holds tube — level now from the ledger volume |
| transformation 2 | pour_add | 13173 | add pipette, add pipette — volumes from the ledger |
| transformation 3 | incubate_wait | 2495 | holds tube — level now from the ledger volume |
| transformation 5 | cool_ice | 2491 | holds tube — level now from the ledger volume |
| transformation 6 | pour_add | 18947 | add pipette — volumes from the ledger |
| transformation 7 | incubate_wait | 5893 | holds tube — level now from the ledger volume |
| western 1 | pipette_mix | 17660 | add pipette, add pipette — volumes from the ledger |
| western 4 | pour_add | 982 | add pipette — volumes from the ledger |
| western 5 | discard | 184 | discard — volumes from the ledger |
| western 6 | pour_add | 959 | add pipette — volumes from the ledger |
| western 8 | pour_add | 1296 | add pipette — volumes from the ledger |
| western 9 | discard | 184 | discard — volumes from the ledger |
| western 10 | pour_add | 13003 | add pipette, add pipette — volumes from the ledger |
| western 12 | pour_add | 1296 | add pipette — volumes from the ledger |
| western 13 | discard | 184 | discard — volumes from the ledger |
| western 14 | pour_add | 12987 | add pipette, add pipette — volumes from the ledger |
| western 16 | pour_add | 1296 | add pipette — volumes from the ledger |
| western 17 | discard | 184 | discard — volumes from the ledger |
| western 18 | pour_add | 1478 | add pipette — volumes from the ledger |
| western 20 | discard | 184 | discard — volumes from the ledger |
## Volumes the text does not determine (flagged; full list in liquid-ledger.md)

- **neutrophil_rna:** none on the bench beyond the pellet (0 µl of liquid). The do-ahead RLT and
  RPE preparations are off the bench; their adds come from bottles.
- **transformation:** competent cells' starting volume (placeholder 150 µl); "plate some or all" → all.
- **pcr:** template "X µl" / water "20.7 − X µl" → X = 10.35 µl (sum kept at 30 µl); the sample's
  contents (placeholder) — the reaction made at station 1 is never drawn from.
- **western:** samples and ladder (5 µl each), primary and secondary antibody (2.5 mL each).
- **passaging:** spent medium (7 mL); "per 10 cm²" read against a T-25; "minimal volume" (1.5 mL);
  seeded volume (all 5.25 mL).
- **elisa:** anti-coagulant (150 µl), four wash buffers (36 µl each), capture antibody / coating
  buffer and dilution buffer (sized to what is later drawn).
- **agarose_gel:** loading dye (150 µl); 100 mL exceeds the drawn T-flask (70 mL) — drawn full.
- **cryopreservation:** cell suspension (150 µl), freezing medium (150 µl); "1 mL into each vial"
  but only 150 µl modelled.
- **gram_stain:** culture, crystal violet, iodine, ethanol, safranin, water (100 µl each; a rinse
  runs off the slide).

## Known limits

- The pipette is drawn as a P200. ≤ 1 mL: passes of one tip (a station of P passes lasts
  6.5 s·(1 + 0.35·(P − 1)), so some runner tiles now catch a pass in progress). A mL pipette move
  (western, passaging) is drawn as ONE pass with a full tip — no serological pipette is modelled.
  Pouring those instead would remove the pipette rig and re-fit the camera, which the look forbids.
- Pours keep their old trigger (≥ 50 mL, or "pour" / "rinse"); their stream lasts volume / 10 mL/s,
  so a 100 µl placeholder rinse is a one-frame stream.
- Surfaces (slide, membrane, gel, agar plate) have no drawn interior: volumes are kept, not drawn.
- The flow-through is discarded by draining in place once the lid opens (no waste choreography).
- At elution the column is not shown; the eluate appears in the tube while it spins.
