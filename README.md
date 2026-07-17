# benchpilot

**Paste a messy lab protocol → get a runnable, timed, gap-flagged 3D walkthrough
you can actually follow at the bench.**

**▶ Try it live: https://benchpilot.vercel.app**

Protocols are prose — a Word doc, a PDF, a paragraph in a paper's methods, often
written by someone else and always missing something. Timings are buried in
sentences, values are underspecified ("350 µl for ≤5×10⁶ cells, 600 µl for more"
— which one is *you*?), hazards are easy to skim past (especially negatives like
*do NOT centrifuge*), and the state of the sample lives only in your head.
benchpilot turns that document into something you can run.

## What it does

1. **Ingest.** Paste text or drop a `.docx`, in any language. The original is
   kept verbatim; English is shown by default with a toggle back to the source.
2. **Understand.** A single Claude call turns the prose into structure — steps,
   what each physically *does*, reagents and volumes, durations, spins, hazards
   (including negatives), conditionals, either/or alternatives, repeats, and the
   **gaps** the protocol leaves undefined.
3. **Before you start.** An intake screen surfaces the open questions the
   document never asked ("Mini or Micro kit?", "How many cells?"), plus the
   prep-ahead checklist, materials, and hazards. Answer once and the run resolves
   correctly instead of guessing.
4. **Run it.** A calm, one-step-at-a-time **3D walkthrough**: the right equipment
   appears for each action (a centrifuge that spins, an incubation block with a
   countdown ring, a spin column, an ice bucket), one sample visibly travels the
   whole protocol (pellet → lysate → +ethanol → onto the column → eluate),
   durations become live timers, conditionals resolve from your answers, and
   hazards surface in red.

## Why it's different

**protocols.io**, the incumbent, requires you to *manually author* a protocol
into its format and then renders it as plain text — the authoring is the work,
and the payoff is a nicer-looking list. benchpilot's wedge is the opposite:
**instant ingestion** (paste anything, Claude does the structuring) and **a
genuinely runnable experience** (3D, timed, interactive). The protocol you
already have, turned into something you can follow.

The bet: the valuable part isn't the 3D — it's that a language model can read a
messy, human-written protocol and recover the structure a bench scientist holds
in their head (action vs note, what's timed, what's dangerous, what's undecided).
Once you have that structure, the walkthrough is just a view of it. The 3D is
what makes people want to use it.

## Quickstart

**Parse a protocol** (needs `ANTHROPIC_API_KEY`):

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export ANTHROPIC_API_KEY=...
python scripts/parse_check.py            # parses examples/*.docx
open outputs/parsed_preview.html
pytest -q                                # offline; no key needed
```

**Run the player** (the 3D walkthrough — bundled demo data, zero backend):

```bash
cd web/frontend && npm install
npm run dev      # eyeball the player
npm test         # offline Vitest — pure runtime logic
npm run build
```

## Layout

- `core/` — the interface-agnostic parse engine. `parse_protocol(text, llm)`
  takes protocol text + an injectable `llm(system, user)` and returns structured
  data (`core/schema.py`). Zero web/UI/file knowledge — one batched, cached LLM
  call for the whole protocol.
- `web/frontend/` — the protocol player (Vite + React 18). Consumes the parsed
  schema only; pure runtime logic in `src/lib/runtime.js`, the 3D vessel in
  `src/vessel/`.
- `scripts/parse_check.py` — run the parse, write `outputs/parsed.json` + preview.
- `examples/` — the reference protocol (Polish RNA extraction from neutrophils).

## Status

Parsing, intake, and the 3D walkthrough work end-to-end on the reference
protocol, driven entirely by the parsed schema (no hardcoded steps). Not yet
proven: that it holds up on a *different* protocol — which is the whole thesis,
and the next thing to do.
