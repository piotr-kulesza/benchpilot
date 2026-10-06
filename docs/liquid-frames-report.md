# Liquids move only with their transfer — neutrophil_rna (branch `polish`)

Review finding on the preview: (1) a tube's level kept dropping after the pipette had left it;
(2) a liquid's colour changed when nothing was added.

## Cause — where volume and colour followed station progress or their own clock, not the transfer

1. **Every liquid eased on its own clock.** `buildTube`, `buildSpinColumn` (and its flow-through), the
   flat vessels, the pipette tip and the bottles each chased their target with their own
   exponential `lerp(…, 1 − 0.00x^dt)`, in level AND colour. The station set a target from its
   progress p; the drawn level kept moving for ~1 s after the tip left, a colour drifted after the
   inflow ended, and tip + vessel were never equal in a frame. (`demoScene.js`, each builder's `update`)
2. **The tip drew in the air.** `pipPhaseA` drew while the tip rose out of the source, and it only
   went down to `from.y + 0.72` — above a bottle's liquid, and above a draining tube's.
3. **Colour keyframes.** `evolve()` set the end colour at p > 0.5; the flow-through took its mixed
   colour on the first spin frame (`setFlowColor(e > 0 ? … )`).
4. **"Discard the flow-through" drained in place** in the rotor (no transfer at all).
5. **Hidden vessels kept another station's volume.** Only the station's own vessel was set on entry,
   so the collection tube, the clean tube and the DNase mix entered holding what some other
   station had left them, then animated to theirs (boundary jumps; level changes with no transfer).
6. **Elution filled the eluate tube without draining the column** (not drawn, but not conserved).
7. A 0.004-level / 0.01-fill visibility threshold and the lathe's 0.001 floor dropped up to 0.7 µl
   in and out of sight.

## The check (red first)

`src/dev/liquidFrames.js` + `scripts/liquid-frames.mjs`: on the live runner, every neutrophil station
is run frame by frame (60 frames per second of its duration — finer than 1/60 of it) and what is
DRAWN is read back (each liquid through its drawn shape, its material colour, the tip's position).
It fails when (a) a volume changes while no transfer to or from it is active — the tip below the
surface (drawing) / inside the target (dispensing) with its contents changing the other way, the
vessel riding a turning rotor, or a connecting stream; (b) a colour changes with nothing flowing in,
or the tip is not its source's colour; (c) vessels + tip are not conserved in a frame (> 0.5 µl);
(d) a station starts other than the previous one ended. The checker itself is proven red on
synthetic frames (`liquidFrames.test.js`, 5 tests).

**Before the fix (cbcb0cb): 18 of 26 stations red** — a 1649, b 115, c 2165, d 3 violation-frames:

| station | step | a | b | c | d | first |
|---|---|---|---|---|---|---|
| 2 | step 5 pour_add | 191 (frames 104–612) | — | 123 (frames 112–612) | — | source r: -0.05 µl with no transfer (the tip is in it but holds still) |
| 4 | step 7 pour_add | 191 (frames 117–474) | 32 (frames 264–577) | 133 (frames 125–573) | — | source r: -0.05 µl with no transfer (the tip is in it but holds still) |
| 5 | step 8 transfer | 99 (frames 97–857) | — | 320 (frames 95–857) | — | tube: -8.88 µl with no transfer (the tip is above the liquid) |
| 6 | step 9 centrifuge | 2 (frames 655–660) | 18 (frames 365–408) | 148 (frames 364–660) | — | flow: -1.11 µl with no transfer |
| 7 | step 10 pour_add | 193 (frames 117–600) | — | 115 (frames 125–600) | — | source r: -0.05 µl with no transfer (the tip is in it but holds still) |
| 8 | step 11 centrifuge | 2 (frames 653–656) | 9 (frames 370–401) | 162 (frames 368–656) | — | flow: -1.06 µl with no transfer |
| 9 | step 3 prepare | 18 (frames 1–616) | 47 (frames 514–595) | 98 (frames 1–616) | 1 (frame 0) | prep0: -9.29 µl with no transfer |
| 10 | step 12 pour_add | 26 (frames 256–568) | — | 65 (frames 255–568) | — | prep0: -4.34 µl with no transfer |
| 12 | step 14 pour_add | 194 (frames 105–602) | 5 (frames 251–302) | 116 (frames 113–602) | — | source r: -0.05 µl with no transfer (the tip is in it but holds still) |
| 13 | step 15 centrifuge | 1 (frame 657) | 2 (frames 367–370) | 148 (frames 366–657) | — | flow: -1.33 µl with no transfer |
| 14 | step 16 pour_add | 284 (frames 110–731) | — | 172 (frames 116–731) | — | source r: -0.05 µl with no transfer (the tip is in it but holds still) |
| 15 | step 17 centrifuge | — | 2 (frames 367–369) | 119 (frames 366–590) | — | flow: #5161da → #5061da with nothing flowing in |
| 16 | step 18 pour_add | 284 (frames 110–731) | — | 172 (frames 116–731) | — | source r: -0.05 µl with no transfer (the tip is in it but holds still) |
| 17 | step 19 centrifuge | 28 (frames 1–100) | — | 157 (frames 1–589) | 1 (frame 0) | flow: +24.81 µl with no transfer |
| 18 | step 20 transfer | 28 (frames 1–41) | — | 28 (frames 1–41) | 1 (frame 0) | tube: -79.19 µl with no transfer |
| 19 | step 21 centrifuge | 31 (frames 1–47) | — | 31 (frames 1–47) | — | flow: -105.02 µl with no transfer |
| 20 | step 22 pour_add | 77 (frames 141–469) | — | 39 (frames 360–469) | — | source r: -0.05 µl with no transfer (the tip is above the liquid) |
| 22 | step 24 elute | — | — | 19 (frames 389–571) | — | Σ: vessels + tip +0.98 µl in one frame |
**After: 26 of 26 green** (`node scripts/liquid-frames.mjs`, exit 0). Full suite: 463 passed
(the 78 liquid-ledger proofs and the 5 checker tests among them). Build clean.

Evidence: `docs/liquid-frames/liquid-frames-sheet-{1..7}.jpg` — every station's first frame of each
failing check, before and after, with each vessel's drawn volume and colour (hex) under the tile and
what failed above it. The per-station start / middle / end sheet is regenerated:
`docs/liquid-sheet/neutrophil_rna-{1,2,3}.jpg`.

## The fix

- **One clock.** In volume mode every builder draws its level and colour exactly as set this frame —
  no easing of its own; the transfer that sets them is the only clock. A volume hides only at 0 µl;
  the lathe floor is 1e-5.
- **The tip draws only below the surface:** over the source, down (to 0.1 under a bottle's line, to a
  tube's floor), hold and draw, up full; the source falls on that same curve (`drawProgress`), and
  dispensing stays on `dispenseProgress` for both tip and target. Every source bottle falls by exactly
  what its tips drew.
- **Colour is contents:** a volume-weighted mix recomputed from what has flowed in; no keyframes;
  the flow-through mixes in as the rotor moves it; the tip carries its source's colour.
- **Every vessel enters at the ledger's start** (hidden ones and not-yet-made mixes too: 0 µl).
- **"Discard the flow-through" is done at the bench**, at the next station with the column (it is
  seated in the rotor until then): the column lifts out and stands aside (held), the station's own
  pipette draws the flow-through from below its surface, a 200 µl tip at a time, into a waste beaker,
  and the column goes back. (A tipped tube was tried first and rejected: the liquid is drawn rigid in
  the tube, so a tube tipped past level kept its liquid at its raised bottom.) The ledger records the
  discard there.
- During an elution the (undrawn) column rides in the eluate tube and drains as it fills.

## Unchanged

Camera, framing, sizes, materials, lighting, models: the beaker is the existing `buildWaste`, set out
of the frame fit (`noFrame`). Collision audit, neutrophil: 17 → 17 collision-red stations, 0 → 0
motion-red; the discard stations (7, 9, 14) have exactly their previous findings (the rotor-slot ones).
Runner tiles (neutrophil, vs the previous liquid round): 16 identical, 10 changed — the stations whose
liquids were wrong, and 7 / 9 / 14, which now carry the discard (longer, so their tile catches it
mid-way). Stations whose liquid flows now take a little longer (the draw holds at the bottom).
