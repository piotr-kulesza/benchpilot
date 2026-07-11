# Stage 9 — turn it into a service: home page, upload, example picker

## Goal

benchpilot currently boots straight into a hardcoded protocol. Make it a real product:

**Home → (upload your protocol | pick an example) → parse → intake → 3D run.**

## The flow

```
/            Home: what it is + upload + the 8 example protocols
   ↓ pick an example            ↓ upload / paste
   (load PRE-PARSED json)       (live parse via the API)
   ↓                            ↓
/intake      "Before you start" — open questions, prep-ahead, materials, hazards
   ↓
/run         the 3D walkthrough (unchanged)
```

## 1. Home page

- Short hero: what benchpilot does (see `WHAT_IT_IS.md` — don't re-invent the copy).
- **Upload**: drag-and-drop or file picker for `.docx` / `.txt` / `.md`, **plus a paste box**
  for raw text. `core/ingest.py` already handles docx / txt / pasted strings.
- **Example protocols**: a grid of cards for the 8 fixtures (neutrophil RNA extraction,
  bacterial transformation, PCR, Western blot, cell passaging, sandwich ELISA, agarose DNA
  gel, cryopreservation, Gram stain). Each card: name, technique, step count, and the
  distinctive equipment it shows (e.g. "96-well plate · plate reader", "thermocycler ·
  30 cycles"). These are the proof the thing generalizes — surface that.
- Visual language: coherent with the existing intake/runner. Don't invent a third style.

## 2. Examples load PRE-PARSED (this is non-negotiable)

**Never live-parse an example.** You already have the committed cached LLM responses from
the Stage 7 harness (`tests/fixtures/cache/`). Generate a `parsed.json` for each of the 8
from those cached responses and bundle them in `web/frontend/public/protocols/`.

Result: clicking an example is **instant, offline, needs no API key, and cannot fail** —
which is exactly what you want when demoing. A live parse on camera is the one thing that
can hang or blow up.

## 3. Uploads parse live

- Wire the frontend to `web/api.py`'s `POST /api/parse` (FastAPI, already exists, guarded).
- Send the uploaded file / pasted text; receive the parsed `Protocol` JSON; route to intake.
- **Loading state**: it's one batched LLM call — show honest progress ("reading your
  protocol…"), not a fake spinner that implies instant.
- **Graceful failure**: if the backend is down, has no `ANTHROPIC_API_KEY`, or the parse
  fails, say so plainly and keep the example protocols fully usable. The app must never be
  bricked by a missing backend — the bundled examples work with **zero backend**, as today.

## 4. State + routing

- Real routes (`/`, `/intake`, `/run`) rather than the current `?run=1` query flags; keep
  the existing deep links working (`?run=1&step=N`) so nothing that exists breaks.
- Hold the parsed protocol in app state; persist it (sessionStorage) so a reload mid-run
  doesn't dump the user back to Home.
- A visible way back to Home to try another protocol.

## Constraints

- **The intake and the 3D runner do not change.** They already consume the schema; they
  should not care whether it came from a bundled file or a live parse.
- `core/` stays pure — no web knowledge. The API layer stays a thin wrapper.
- One batched LLM call per parse, cached by input hash (unchanged).
- Keep `npm test` + `pytest -q` green.

## Acceptance

- [ ] Home lists all 8 examples; clicking one goes intake → run with **no backend running
      and no API key set**.
- [ ] Uploading a `.docx` and pasting raw text both parse live and reach the run.
- [ ] With the backend down: examples still work, upload fails with a clear message, app
      is not bricked.
- [ ] Reload mid-run keeps the protocol; deep links still work.
- [ ] Each example renders its correct technique-specific equipment (plate, thermocycler,
      gel rig, slide, freezer…) — the generalization is visible from the home page in two
      clicks.
- [ ] Tests green.

## Note

Once this lands, the demo is: open the site → pick a protocol it has never been tuned for
→ watch it run. That's the product, and the home page is what makes it legible as one.
