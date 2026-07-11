# benchpilot — what it is

## One line

Paste a messy lab protocol → get a runnable, timed, gap-flagged 3D walkthrough
you can actually follow at the bench.

## The problem

Protocols are prose. A Word doc, a PDF, a paragraph in a paper's methods —
often written by someone else, sometimes in another language, and always
missing something. The person at the bench has to hold all of it in their head:

- **Timings are buried in sentences.** "incubate 15 min at room temperature" is
  a wait you have to notice, start, and remember.
- **Values are underspecified.** "350 µl for ≤5×10⁶ cells, 600 µl for more" —
  which one is *you*? The document never asks.
- **Hazards are easy to miss**, especially the negatives: *do NOT centrifuge.*
  One line of prose, and skimming past it ruins the sample.
- **Choices are implicit.** "Homogenise on a QIAshredder column **or** pass 5×
  through a 20–21 G needle." Two different procedures, one sentence.
- **The state of the sample is invisible.** What's in the tube right now? What
  colour, what volume, which vessel? You track it in your head.

So people run protocols off a printed page, and mistakes are quiet ones.

## What benchpilot does

**1. Ingest.** Paste text or drop a `.docx`. Any language — the original is kept
verbatim; English is shown by default with a toggle back to the source.

**2. Understand.** A single Claude call turns the prose into structure: steps,
what each one physically *does*, reagents and volumes, durations, spins, hazards
(including negatives), conditionals, either/or alternatives, repeats — and
**gaps**: the values the protocol leaves undefined.

**3. Before you start.** An intake screen: the open questions the document never
asked, answered once ("Which kit — Mini or Micro?", "How many cells?"), plus the
prep-ahead checklist, materials, and hazards. Answer them here and the run
resolves correctly instead of guessing.

**4. Run it.** A calm, one-step-at-a-time **3D walkthrough** — a bench you travel
down, one station per action:

- The right **equipment appears for the actual action**: a centrifuge that spins,
  an incubation block with a countdown ring, a spin column, an ice bucket, a
  reader.
- **One sample travels the whole protocol** and visibly changes as it goes —
  pellet → lysate → + ethanol → onto the column → eluate. You can see what's in
  the tube.
- **Durations become live timers.** Conditionals resolve from your intake
  answers. Either/or steps become a choice. Hazards surface in red, negatives
  loudest.
- Nothing is hidden behind prose you have to re-read mid-pipetting.

## Who it's for

Bench scientists running protocols they didn't write. The reference protocol is
a real one — total RNA extraction from neutrophils, written in Polish, with all
the ambiguity of a genuine lab document.

## Why it's different

**protocols.io** — the incumbent — requires you to *manually author* the protocol
into their format, and then renders it as plain text. The authoring is the work,
and the payoff is a nicer-looking list.

benchpilot's wedge is the opposite: **instant ingestion** (paste anything, Claude
does the structuring) and **a genuinely runnable experience** (3D, timed,
interactive) rather than a prettier document. The protocol you already have,
turned into something you can follow.

## The bet

The valuable part isn't the 3D — it's that a language model can read a messy,
human-written protocol and recover the *structure a bench scientist holds in
their head*: what's an action vs a note, what's timed, what's dangerous, what's
undecided. Once you have that structure, the walkthrough is just a view of it.
The 3D is what makes people want to use it.

## Status

- Parsing, intake, and the 3D walkthrough work end-to-end on the reference
  protocol.
- The walkthrough is driven entirely by the parsed schema — no hardcoded steps.
- **Not yet proven:** that it holds up on a *different* protocol. That's the
  whole thesis, and it's the next thing to do.
