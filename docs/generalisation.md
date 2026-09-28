# Does the vocabulary generalise? — first out-of-sample measurement

*Measured 2026-09-24. Evidence is committed; see "Where the evidence is" below.*

## The claim being tested

benchpilot's thesis is that any pasted protocol becomes a runnable walkthrough: the
parser maps every step onto a fixed **action vocabulary** (19 verbs, `core/schema.py
ACTIONS`) and a fixed **container vocabulary** (14 vessels, `CONTAINERS`), and the 3D
scene follows **one sample** through those steps. Until this measurement, that claim had
only been checked on the protocols the vocabulary was built from.

## Why the nine bundled protocols cannot measure it

The nine bundled protocols (`web/frontend/public/protocols/`) are **in-sample**. They were
chosen and staged for this project (`tests/fixtures/README.txt`): the Polish Neutrophil RNA
protocol is the reference the scene was designed on; four are vendor protocols fetched
verbatim (Addgene, Gibco/Thermo, Abcam, Cell Signaling); PCR combines a real reaction table
with a standard program; three (agarose gel, cryopreservation, Gram stain) are standard
representative protocols written for the set. The action and container vocabularies, the
prompt, and the scene were then built and tuned **against these nine**. Their 3% generic
rate measures fit, not generalisation. It must never be quoted as evidence that the
vocabulary covers protocols in general.

## Method

- **One unseen document:** `examples/pmc12207774_methods.txt`, the Methods section of a
  published paper (PMC12207774), 13,646 characters, never used in development.
- **Nothing tuned.** No vocabulary, prompt or scene change was made for it. The only
  changes made between the first and the measured parse were output-size trims that apply
  to every protocol (omit empty fields, compact JSON, `max_tokens` 128,000) — needed
  because the first parse was truncated at 32,000 tokens (see below).
- **Parsed through the gate** (`scripts/fresh_parse.py` → `scripts/audited_parse.py`): one
  batched call per attempt, current prompt, cache bypassed, every attempt's raw response
  kept. Model `claude-opus-4-8`.
- **Measured on the complete parses** with `web/frontend/scripts/schema-audit.mjs --file`
  and against the raw responses (to see what the model emitted before the schema coerced
  anything).

## Results

| | Tenth protocol (3 runs) | 9 bundled (in-sample) |
|---|---|---|
| steps | 73 / 72 / 71 | 144 in total |
| steps rendered generic / bench | 17 (23%) / 12 (17%) / 16 (23%) | 5 (3%) |
| action or container values outside the vocabulary | none | none |
| audit defects | 2 / 2 / 1 | 0 |
| gate verdict | **rejected, 3 of 3** | accepted |
| wall-clock per parse call | 182 / 186 / 182 s | — |
| output per call | ~21,000 tokens (46–48k chars) | — |

- **The first parse was truncated** at the then-configured `max_tokens=32000` (74,136
  chars, exactly 32,000 tokens; `tests/fixtures/fresh_parse/pmc12207774_methods.RAW.txt`).
  That is why the output trims came first; the coverage numbers above are all from
  complete, untruncated parses.
- **All three runs were rejected on the same rule** (`transfer` names no destination —
  `findTransferHandoffDefects`): steps 6 and 7 in two runs, step 6 in the third.
- **The model never left the vocabulary.** It did not invent a verb or a vessel; it
  squeezed what did not fit into the nearest word or into `generic`. So an out-of-vocabulary
  count is not a coverage metric: coverage failure shows up as *generic steps* and *wrong
  mappings*, not as unknown tokens.
- **What fell back to generic:** animal work (intragastric dosing, anaesthesia, surgery,
  randomisation, sacrifice), steps delegated to a kit ("per the manufacturer's protocol"),
  tissue processing (paraffin embedding, sectioning, sealing with neutral gum), and a
  wound-healing scratch.
- **Timing against the platform:** one call fits the 300 s Vercel function limit; a retry
  does not (≈ 370 s for two). The paste path therefore makes exactly one attempt.

## The vocabulary gap found: filtration

"Pass the suspension through a 70 µm sieve … separate using a 40 µm sieve and collect the
filtrate." There is **no filter action** and **no strainer or filtrate vessel**. The
parser, keeping to the vocabulary, called it `transfer` — and a transfer with no named
destination is exactly the parse the gate refuses. Three runs, the same mapping, the same
rejection: this is a stable gap, not model noise.

## The structural finding: one sample does not fit a multi-assay document

A Methods section is not one protocol. This one is 13 independent procedures — cell
isolation, cell culture, a viability assay, flow cytometry, an animal model, animal
treatment, H&E and immunofluorescent staining, ELISA, RT-qPCR, a wound-healing assay,
immunohistochemistry — with no single sample thread. The scene's sample-follow model
carries the last-named vessel forward, so steps 21–28 (rat dosing, anaesthesia, surgery)
would have rendered **a tube standing on the bench while the text describes surgery on a
rat**. More verbs cannot fix that; it is a mismatch between the document and the one-sample
model, and it breaks hard constraint 1 (a wrong depiction is worse than none) at document
scale.

**Decision:** the paste path refuses such a document by name, from the source text and
before any parse call: *"This looks like a Methods section covering several separate
procedures, not one protocol."* (`core/validate.py detect_multi_assay`; a heuristic on
numbered subsection headings and Methods-section markers — an unnumbered, unmarked
multi-assay text can still pass.)

## What this does and does not show

- It shows the vocabulary does **not** generalise to a published Methods section: 17–23%
  generic against 3% in-sample, and a document the gate cannot accept.
- It is **one** document, and a Methods section is the hardest case for a one-sample
  model. It does not measure single-procedure protocols from outside the project. The next
  measurement should be several unseen *single* protocols (e.g. from protocols.io), parsed
  the same way, nothing tuned.

## Where the evidence is

- Source: `examples/pmc12207774_methods.txt` — CC BY-NC 4.0; attribution in
  `examples/pmc12207774_methods.ATTRIBUTION.md`.
- **If benchpilot is ever commercialised, `examples/pmc12207774_methods.txt` and its raw
  parses (`tests/fixtures/fresh_parse/pmc12207774_methods.*`) must be removed** — the
  licence is non-commercial.
- Truncated first parse: `tests/fixtures/fresh_parse/pmc12207774_methods.RAW.txt`.
- The three gated attempts and their timings:
  `tests/fixtures/fresh_parse/pmc12207774_methods.attempt{1,2,3}.txt`, `….attempts.json`.
- Reproduce the coverage numbers: parse an attempt through `core.parse.parse_protocol`
  with a replaying llm, write the JSON, and run
  `node web/frontend/scripts/schema-audit.mjs --file <that.json>`.
