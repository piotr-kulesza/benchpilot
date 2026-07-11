# Stage 8 — make the render generalize too: real container geometry

## Why this exists

Stage 6/7 proved the **parse** generalizes: 2.7% generic across 112 steps from 8
techniques the parser was never built for, every technique hitting its intended verb.

But the **render does not**. Every non-tube container currently falls back to the
microtube geometry. So right now:

- an ELISA in a **96-well plate** draws a microtube
- a Western on a **membrane** draws a microtube
- a Gram stain on a **glass slide** draws a microtube
- **cryovials** in LN₂ draw a microtube

That is the visible half of the product, and it breaks the core promise in
`WHAT_IT_IS.md` — *"one sample travels the whole protocol and you can see what's in
the tube"* — because it isn't a tube. A bench scientist spots this in three seconds.

**This stage closes the gap: the sample must travel through the actual glassware.**

## Order of work — do the polish FIRST

The in-flight plausibility polish touches the same `demoScene.js` choreography that
container insert/remove motions build on. Finish it before starting geometry, or you
will redo it:

1. Remove the cap from the sample tube entirely (`buildTube`).
2. Seat the sample in a **real rotor slot** of the centrifuge (correct radius + outward
   tilt, parented to the rotor so it spins with it); lid closes to spin, opens after.
3. `buildBottle` cap opens to aspirate and closes after; bottle liquid level drops as
   the pipette draws (volume conserved).
4. Fix the pipette clipping the top HUD bar during its travel arc.

## READ THIS BEFORE WRITING ANY GEOMETRY

New builders are exactly where the art direction gets re-broken, because "make the gel
tank look good" invites photoreal materials. **Read `HANDOFF.md`'s gotcha list first.**
The demo is **stylized, not photoreal**:

- Glass = `MeshPhysicalMaterial`, `opacity 0.24`, `clearcoat 1`, `envMapIntensity 1.35`,
  + `fresnelize()`. **No `MeshTransmissionMaterial`. No `transmission`/`ior`/`thickness`.**
- **ZERO postprocessing.** No bloom, no DOF, no SSAO. Do not add an `EffectComposer`.
- `LinearToneMapping` @ exposure 0.78. three r155+ divides light intensity by π —
  respect `LIGHT_SCALE`.
- Colour comes from **liquids, caps, reagents** — never instrument bodies, never status LEDs.
- Reuse the demo's `mat*` helpers (`matPlastic`, `matBrushed`, `matAnodized`, `matPainted`,
  `glassMaterial`). Copy numbers from `demos/neutrophil-rna-extraction.html`.

**Verify every new builder by sampling pixel RGB against the demo, not by eye.**

## 1. Container geometry + motions

Each container gets: geometry, an **insert-sample** motion, and a **remove-sample**
motion. The removal motion follows `resolveRemoval(container)` — already implemented:
**tubes tip and dump; plates/flasks/dishes/membranes are aspirated (never tipped).**

Build these (microtube / spin_column / eluate_tube already exist):

| container | geometry | notes |
|---|---|---|
| `well_plate` | 96-well plate | sample lives in a well; **aspirated**, never tipped. Liquid level per well. |
| `flask` | culture flask (canted neck) | sample is a liquid layer on the base; aspirated. |
| `dish` | petri dish | shallow liquid layer. |
| `agar_plate` | petri dish + agar bed | for `seed`: liquid dropped on, spreader sweeps. |
| `gel` | agarose gel in a casting tray | sample = loaded well + migrating band. |
| `slide` | glass microscope slide | sample = a smear/film on the surface; for `stain`, colour floods over it. |
| `membrane` | nitrocellulose sheet | sample = bands on the sheet; aspirated. |
| `cryovial` | screw-cap cryovial | goes into the freezer/dewar for `store`. |

The **sample-follow** sequence already tells each step its container. Your job is to make
each container mount its own geometry and its own insert/remove motion, so the single
travelling sample visibly moves *between different kinds of vessel* — tube → plate →
membrane → slide — carrying its contents.

## 2. Remaining equipment builders

- **`buildFreezer`** / **`buildDewar`** — for `store` (−20/−80 °C freezer, LN₂ dewar):
  vessel placed inside, frost creep, door/lid.
- **`buildAgarPlate`** + **spreader** — for `seed` on agar: liquid dropped, spreader sweeps.
- **`buildStainingTray`** — for `stain`: slide in the tray, dye flooding over the surface.

(`buildThermocycler` and `buildGelRig` already exist from Stage 6.)

## 3. Integration

- Every `container` in the closed vocab mounts real geometry — **nothing falls back to the
  tube any more**, and nothing renders blank.
- Every action still mounts its equipment station (unchanged).
- The travelling sample carries its contents across container changes (level/colour persist
  through the swap).

## Acceptance

Headless screenshots, compared against the demo for style:

- [ ] ELISA renders a **96-well plate**, and a wash **fills then aspirates** (never tips).
- [ ] Western renders a **membrane** for the blot steps and the **gel rig** for the run.
- [ ] Gram stain renders a **glass slide** with dye **flooding over it**.
- [ ] Cryopreservation renders **cryovials** going into a **freezer/dewar** with frost.
- [ ] Agar spread renders a **petri dish + spreader** sweeping.
- [ ] PCR renders the **thermocycler** with its cycle counter.
- [ ] The sample visibly **travels between different container types** carrying its contents.
- [ ] The **neutrophil RNA protocol is visually unchanged** (regression guard).
- [ ] No `MeshTransmissionMaterial`, no postprocessing anywhere; new builders match the
      demo's pixel RGB.
- [ ] `npm test` + `pytest -q` green; every container and every action resolves.

## Orchestration

Fan out **only if each builder is its own file** — one subagent per container/equipment
builder, each given `demos/neutrophil-rna-extraction.html` as the art reference and
`HANDOFF.md`'s gotcha list. Then ONE integration pass wires them into the Scene. If they
share a file, do them serially.

---

**When this lands, the pitch is fully earned: give it any protocol, and you watch the real
sample move through the real glassware.**
