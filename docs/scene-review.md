# Scene review — rubric and audit prompt

The 3D is judged by rendering it and looking, never by reading the code and never
by eye on a live dev server. This file holds the standard a render is judged
against and the prompt that does the judging.

## The loop

```bash
cd web/frontend && npm run dev            # the harness routes need the DEV server
node scripts/schema-audit.mjs             # semantic defects, no GPU, seconds
node scripts/shots.mjs --set current      # the fixed render set
node scripts/contact-sheet.mjs current    # captioned sheets → dev-shots/sheets/
```

Then hand the sheets plus this file to the model, take the ranked defect list,
fix, and re-run. To prove a change did what it claimed and broke nothing else:

```bash
node scripts/shots.mjs --set baseline     # once, when the set is known-good
# …make the change…
node scripts/shots.mjs --set current
node scripts/contact-sheet.mjs --diff baseline current matrix
```

The semantic audit runs first because it is free and it finds a different class
of fault: a render can look perfect and still be a lie the pixels cannot show.

## What the captions mean

Every tile carries ground truth beside the picture, so review is a comparison,
not an aesthetic opinion.

- **Model sheets** — the caption is the `orient` note from `src/dev/registry.js`,
  the stated correct resting pose. "T-flask LIES FLAT on its side, canted neck at
  a top corner" is falsifiable; "looks nice" is not.
- **Matrix sheets** — the caption is the action and container being driven, at a
  fixed point on the timeline. The question is whether the motion depicts *that
  action* on *that vessel*.
- **Runner sheets** — the caption is the step's parsed `action`, `container` and
  its English text. The question is whether the picture is a fair depiction of
  the sentence.

## Hard constraints — a violation is a defect at any quality level

These are correctness, not taste. A prettier render that breaks one of these is
worse than the plain render it replaced, because in a teaching context a
convincing picture of the wrong thing is taught and believed.

1. **A wrong instrument is worse than a missing one.** If the action does not
   resolve to a known instrument, the bench is the correct answer.
2. **A meaningless animation is worse than none.** Motion must depict what the
   step physically does.
3. **Nothing floats. Nothing teleports.** Leaving a docked instrument, the sample
   lifts straight up to clearance before it travels.
4. **Only tubes tip.** A plate, dish, membrane, slide or gel is aspirated, never
   tilted and poured.
5. **A `prepare` never acts on the sample's vessel.** A side prep happens in its
   own fresh tube.
6. **Continuity.** The sample's colour, level and vessel at the end of step *n*
   must match its state at the start of step *n+1*.
7. **Never invent detail the protocol does not state.** No extra reagents, no
   invented volumes, no equipment the step never mentions. This is the constraint
   that degrades fastest under an instruction to make something look better.

## Quality dimensions — score each tile 1–5

Vague direction produces vague work, so quality is scored on named axes and a
finding must name the axis, the tile and the fix.

**Physical plausibility.** Does this obey gravity, contact and scale? Is the
liquid level consistent with what was added? Does the pipette tip actually reach
the vessel it is dispensing into? (1 = impossible, 5 = a photograph would look
like this.)

**Depiction accuracy.** Does the picture match the caption — the stated pose, the
named action, the parsed container? A centrifuge that spins with the lid open, a
"do NOT centrifuge" step rendered on a rotor: score 1 regardless of beauty.

**Staging.** Does the eye land on the thing the step is about within one second?
Is the acting vessel unoccluded, is the instrument readable, is the frame free of
clutter that carries no information?

**Camera.** Is the subject well framed at this focal length, is the push-in
motivated by the action, is anything clipped by the HUD or the frame edge?

**Timing.** Does the motion start and settle on eased curves rather than linear
ramps? Is the duration proportionate to the real action? Does a timed step read
as waiting rather than as stalling?

**Material and light.** Is glass reading as glass, is the liquid the right
reagent colour, are the shadows grounded, is anything blown out or muddy?

**Continuity.** Across consecutive runner tiles of the same protocol, does the
sample persist as one object?

## The audit prompt

Paste this with the contact sheets attached.

> You are auditing the 3D bench scene of a tool that turns a written lab protocol
> into a step-by-step visual walkthrough. Attached are contact sheets: each tile
> is a render with a caption stating the ground truth it is supposed to depict —
> either a model's correct resting pose, or a step's parsed action and container
> and its text.
>
> Judge each tile against the caption, not against your taste. Score it 1–5 on
> each of: physical plausibility, depiction accuracy, staging, camera, timing,
> material and light. Then check it against these hard constraints, any breach of
> which is a defect regardless of score: a wrong instrument is worse than a
> missing one; a meaningless animation is worse than none; nothing floats or
> teleports; only tubes tip, while plates, dishes, membranes, slides and gels are
> aspirated; a side preparation never acts on the sample's own vessel; the
> sample's state must be continuous between consecutive steps; and no detail may
> appear that the protocol text does not state.
>
> Return ONE ranked list of defects for the whole set, worst first. For each:
> the tile, the axis, what is wrong in one sentence, why it is wrong with
> reference to the caption, and the smallest change that would fix it. Group
> defects that share a single root cause and say so — I would rather fix one
> builder than twenty tiles. Do not propose adding visual detail that the
> protocol does not state. If a tile is correct, say nothing about it.
>
> End with the three root causes that, if fixed, would remove the most defects.

## Notes

- Run the audit over the **whole set at once**, not station by station. Most of
  what reads as poor quality is inconsistency between stations, which is
  invisible when they are reviewed one at a time.
- When fixing, prefer changing a builder in `scene/demoScene.js` or a resolver in
  `vessel/sceneRecipe.js` over patching `StationScene.jsx`. A fix at the source
  removes a class of defect; a fix at the station removes one.
- Reference photographs beat description. For an instrument that reads wrong,
  attach a photo of the real thing and ask for a ranked list of differences —
  that is a comparison task, which models do far better than "make it better".
