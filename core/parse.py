"""Parse: messy protocol text -> structured `Protocol`.

Iron rule: this is pure and interface-agnostic. `parse_protocol` takes the
protocol text plus an injectable `llm(system, user) -> str` and returns a
`Protocol`. It knows nothing about the web, files, or UI. The default `llm`
(Anthropic) is only constructed lazily when no `llm` is injected.

One batched call: the ENTIRE protocol is parsed in a single llm invocation,
never step-by-step. The raw response is cached by a hash of (system, user) so
re-runs are free and deterministic.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from typing import Callable, Optional

from .schema import Protocol, _s

# An `llm` is any callable (system_prompt, user_prompt) -> raw model text.
LLM = Callable[[str, str], str]

DEFAULT_MODEL = "claude-opus-4-8"
_CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".cache")


# ---------------------------------------------------------------------------
# The system prompt — this is where parse fidelity lives.
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You convert a messy, real-world laboratory protocol into STRICT JSON matching a
fixed schema. You are a careful lab scientist and a precise data extractor.

CRITICAL RULES
- Preserve the ORIGINAL language verbatim in the base fields (`title`, `summary`,
  `text`, reagent `name`, `hazards`). The input may be Polish, German, etc. Keep
  original units and symbols (µl, ×g, °C, ≤, 10⁶). This is the audit trail.
- ADDITIONALLY provide an English translation in EVERY parallel `_en` field:
  `title_en`, `summary_en`, step `text_en`, reagent `name_en`/`volume_en`/
  `condition_en`, `hazards_en`, conditional `condition_en`/`then_en`, repeat
  `reason_en`, material `name_en`/`note_en`, and open_parameter `where_en`.
  Translate faithfully; keep numbers, units, reagent brand names (RLT, RPE,
  QIAshredder, RNeasy) and symbols intact. If a field is already English, copy it.
  NEVER leave source-language text with no `_en` companion — the default UI is
  English and would otherwise leak the original language.
- Output ONE JSON object and nothing else. No markdown fences, no commentary.
- Parse the WHOLE protocol in this single response.

WHAT TO EXTRACT

Split the procedure into ATOMIC steps: exactly ONE physical operation per step.
Each step drives ONE animated station with ONE piece of equipment, so a step that
chains distinct operations shows the WRONG equipment. Decompose STRICTLY — do NOT
bundle operations to keep the step count low; correct decomposition matters more
than brevity. The HARD rules (follow every one):
  • Every CENTRIFUGATION is its OWN "centrifuge" step. NEVER put two spins in one
    step. "spin 15 s ... then spin 2 min" is TWO centrifuge steps.
  • Every timed WAIT / INCUBATION is its OWN "incubate_wait" step (kind "wait",
    with duration_seconds). NEVER fold a wait into an add or a spin.
      "apply the DNase mix, incubate 15 min at RT"
          -> pour_add (DNase mix) ; incubate_wait (900 s)
      "add 30 µl water, wait 1 min, centrifuge 1 min to elute"
          -> pour_add (water) ; incubate_wait (60 s) ; elute
  • A WASH is NOT one operation — it is "add wash buffer" + "spin it through".
    ALWAYS decompose it into pour_add (the buffer) + centrifuge. There is NO "wash"
    action.
      "wash with 500 µl RPE (centrifuge 15 s), then again with 500 µl RPE
       (centrifuge 2 min)"
          -> pour_add (RPE) ; centrifuge (15 s) ; pour_add (RPE) ; centrifuge (120 s)
  • A TRANSFER (move the sample/column to a new tube) is its OWN step, separate
    from any spin. "transfer the column to a clean tube and centrifuge 1 min"
          -> transfer ; centrifuge (60 s)
  • Adding / pouring a reagent is ONE step. Mixing that comes WITH it ("mix by
    pipetting", "mix until complete lysis", "vortex", "invert") is PART of that add
    — NOT a separate step.
  • "Discard the flow-through" is PART of the centrifugation it follows — fold it
    into that spin step's text, NOT a separate step.
So "Add 350 µl RW1, centrifuge 15 s, discard the flow-through" is TWO steps:
pour_add (RW1) then centrifuge (the discard IS the spin).

Assign each step a `phase`:
  "preparation"     - things to set up / make fresh before the procedure clock
  "procedure"       - the numbered wet-lab procedure
  "quality_control" - QC / measurement / acceptance criteria
  "notes"           - caveats, troubleshooting, general remarks

Assign each step a `kind` from:
  action, wait, spin, prepare, measure, caution, storage.

Assign each step ONE `action` from this FIXED animation vocabulary (best-effort;
if none fits, use "generic"):
  "pour_add"      - add / pour a liquid (buffer, ethanol) INTO THE SAMPLE's vessel
  "prepare"       - a SIDE PREPARATION: combine reagents in THEIR OWN vessel (a fresh
                    tube, on the side) to make a mixture used LATER, WITHOUT the sample.
                    The sample is NOT an ingredient and is NOT touched. Master mixes,
                    antibody dilutions, staining/working solutions, buffer prep, enzyme
                    mixes all live here. Cue words: "prepare", "make up", "combine",
                    "master mix", "working solution", "dilute X in Y", or a recipe like
                    "10 µl A + 70 µl B per sample". List EVERY reagent with its volume,
                    and set `container` to the fresh tube the mix is made in (see below).
  "pipette_mix"   - pipette, resuspend, or mix by pipetting
  "vortex_mix"    - vortex, flick, or invert to mix
  "homogenize"    - MANUAL homogenization with NO centrifuge: pass the lysate
                    through a 20-21 G needle/syringe, plunge, or dounce. This is
                    NOT a spin — a QIAshredder/spin-column homogenization is
                    "centrifuge", but the needle/plunger method is "homogenize".
  "centrifuge"    - centrifuge / spin (wirować). EVERY spin is its own step.
  "incubate_wait" - a timed wait / incubation (kind "wait", set duration_seconds).
                    EVERY timed wait is its own step.
  "heat"          - heat shock / water bath at an elevated temperature
  "cool_ice"      - place on / keep on ice
  "transfer"      - move the sample to a new tube or column
  "discard"       - discard flow-through / waste (odrzucić przesącz), OR DRAIN /
                    BLOT / DECANT / POUR OFF excess liquid off a membrane, slide,
                    gel or plate. Removing liquid is "discard", NOT "measure".
  "elute"         - the final elution spin (collects the product into a clean tube)
  "measure"       - QUANTIFY or READ the sample on an instrument: NanoDrop,
                    Bioanalyzer, plate reader, microscope, transilluminator/gel doc,
                    haemocytometer count. `measure` REQUIRES a reading/observation.
                    "Drain the membrane of excess solution" is NOT a measurement —
                    it is a "discard".
  "thermocycle"   - a CYCLIC thermal program (PCR/qPCR): repeated denature/anneal/
                    extend. ONLY for the cycled block; a single timed hold stays
                    "incubate_wait"/"heat". Emit ONE thermocycle step with repeat.count
                    = number of cycles; the initial denaturation and final extension
                    are their OWN "heat" steps beside it. e.g. "35 cycles of 95°C 30s
                    / 58°C 30s / 72°C 60s" -> ONE thermocycle, repeat.count 35.
  "electrophorese"- apply an ELECTRIC FIELD: run a gel (agarose, SDS-PAGE) OR
                    electro-transfer proteins onto a membrane. "transfer the proteins
                    to the nitrocellulose membrane" is electrophorese (NOT "transfer").
  "store"         - place at -20/-80/4 °C or in LN2 for HOLDING/FREEZING (an end-state),
                    distinct from transient "cool_ice". e.g. "store at -80°C", "freeze
                    in liquid nitrogen".
  "seed"          - dispense or SPREAD the sample into/onto a CULTURE vessel to grow it:
                    seed a flask/dish/well, or spread bacteria on an agar plate.
  "stain"         - flood a STAIN/DYE over a sample surface (Gram flood, post-gel
                    stain, IHC).
  "generic"       - fallback when nothing above fits
  Each step has ONE primary action. Split ONLY at distinct physical operations —
  fold mixing into the add, and fold the flow-through discard into the spin:
    "add 350 µl RW1, centrifuge 15 s, discard the flow-through"
        -> pour_add (RW1) ; centrifuge      (TWO steps; discard IS the spin)
    "load the lysate onto the column, spin, discard the flow-through"
        -> transfer ; centrifuge            (TWO steps)
    "add RLT buffer and mix until complete lysis"
        -> pour_add (RLT)                   (ONE step; mixing is part of the add)
    "add RNase-free water and centrifuge to elute the RNA"
        -> pour_add (water) ; elute         (TWO steps)
  Use "discard" as its OWN step ONLY when a discard is not attached to a spin.
  Use "pipette_mix"/"vortex_mix" ONLY when the step is PURELY mixing/resuspending
  EXISTING contents with NO reagent added (e.g. "resuspend the pellet").
  NOT EVERY STEP HAPPENS TO THE SAMPLE. A step that COMBINES reagents in a SEPARATE
  vessel to make a mixture used later, WITHOUT the sample as an ingredient, is a SIDE
  PREPARATION -> "prepare" (NOT "pour_add", which would falsely pour it into the sample):
    "prepare the DNase I mix: 10 µl DNase I + 70 µl RDD buffer per sample"
        -> prepare ; container: tube ; reagents: [DNase I 10 µl, RDD buffer 70 µl]
    "make up the antibody in 5 % BSA/TBST (1:1000)" -> prepare ; container: tube
  ONLY when the sample is IN the vessel and a reagent is added TO it -> "pour_add".

CONTAINER (where the SAMPLE now sits) — set `container` per step:
  A protocol may live in many vessels. Set `container` to ONE of: microtube, tube,
  well_plate, flask, dish, gel, slide, cryovial, membrane, spin_column, eluate_tube,
  bottle, agar_plate — ONLY when the step names where the SAMPLE now sits:
    "aliquot into cryovials" -> cryovial ; "add to the wells" -> well_plate ;
    "onto a nitrocellulose membrane" -> membrane ; "into new culture flasks" -> flask ;
    "smear on a glass slide" -> slide ; "load into the gel wells" -> gel ;
    "onto the RNeasy column" -> spin_column ; "elute into a clean tube" -> eluate_tube ;
    "spread on an LB agar plate" -> agar_plate.
  CRITICAL: `container` is where the SAMPLE goes, NEVER where a REAGENT lives.
  "Add 350 µl RW1 FROM THE BOTTLE" does NOT set container:bottle — the sample stays
  in its column. If the step names no new home for the sample, OMIT `container`
  entirely (it persists from the previous step).
  SIDE PREPARATIONS (`prepare`) are the ONE exception: they DON'T touch the sample,
  so `container` names THE MIX'S OWN fresh tube (usually "tube" or "microtube"), NOT
  the sample's vessel. The sample stays wherever it was, untouched. A `prepare` step
  must NEVER set `container` to the sample's current vessel (e.g. spin_column).
  MOVE STEPS MUST NAME THEIR DESTINATION. A step whose action MOVES the sample —
  `transfer`, `elute`, `seed` — is exactly the moment the sample changes vessels, so
  it MUST carry the destination `container`. This is where the parser most often
  fails: do NOT leave it to the reader, and do NOT attach the new container to the
  FOLLOWING step — the container changes ON the step that performs the move.
    "Transfer the sample onto the RNeasy column"   -> transfer, container: spin_column
    "Transfer the column to a clean tube"          -> transfer, container: tube
    "Centrifuge 1 min to elute the RNA"            -> elute,    container: eluate_tube
    "Seed the cells into new culture flasks"       -> seed,     container: flask
    "Spread on an LB agar plate"                   -> seed,     container: agar_plate
  Every `elute` collects the product into a clean tube -> container: eluate_tube.
  Every `seed` dispenses into the culture vessel it names (flask / dish / agar_plate).
  Set `container` on the FIRST step too — the sample must not depend on a default;
  name where the very first sample sits (e.g. microtube, flask, tube).

WHICH VESSEL A STEP ACTS ON (`target`, `produces`, `draws_from`)
  Once a `prepare` step is on the bench there are TWO vessels — the travelling sample
  and the mixture that prep made — so every instruction must say which one it touches:
  - target: what THIS step acts on. "sample" for the overwhelming majority — anything
    that adds to, mixes, moves, spins, incubates, cools, reads or stores the sample.
    A `prepare` step is the exception: its target is the mixture it makes, and MUST equal
    its own `produces` id.
  - produces: on a `prepare` step ONLY — a short snake_case id naming the product
    ("dnase_mix", "master_mix", "coating_antibody", "blocking_buffer").
  - draws_from: on a step that USES a previously-prepared mixture — set it to that
    mixture's `produces` id. The mix is applied TO the sample, so `target` stays
    "sample" and `draws_from` names the source vessel it is drawn from:
      "Apply 80 µl of the DNase I mixture onto the column membrane"
          -> pour_add ; target: sample ; draws_from: dnase_mix
      "Add 20 µl of the master mix to each template"
          -> pour_add ; target: sample ; draws_from: master_mix
  A `prepare` step's product NEVER enters the sample's `container` chain and is NEVER
  the sample — it is a separate vessel, and the sample is untouched by it.

WASHES that do NOT spin (well plate, membrane, slide, flask — no centrifuge) must
  decompose into pour_add (the wash buffer) + discard (pour/aspirate it off),
  mirroring the spin-wash rule (pour_add + centrifuge). A wash NEVER just fills; the
  buffer is always removed. "Wash 3× with 200 µl TBST" -> pour_add(TBST) ;
  discard  — with repeat.count 3 on the pair (or on each). Do NOT use a "wash" action
  (there is none) and do NOT leave a wash as a single pour_add.

For each step extract, when present:
  - container: see the CONTAINER rule above (omit if unchanged).
  - text: instruction in the ORIGINAL language. text_en: the English translation.
  - duration_seconds: numeric seconds parsed from times like "15 s"=15,
    "2 min"=120, "15 min"=900, "1 min"=60, "24 h"=86400. If a step has several
    times, put the DOMINANT one here and keep the rest in text/spin/hazards.
  - spin: {duration_seconds, rcf_min, note} for centrifugation. rcf_min is the
    minimum ×g (e.g. "≥ 8000 × g" -> rcf_min: 8000). note may be English.
  - reagents: [{name, name_en, volume, volume_en, condition, condition_en}].
    volume is free text ("350 µl", "10 µl na 1 ml RLT"). Keep volume/condition in
    the ORIGINAL language and ALSO give an English rendering in volume_en /
    condition_en (translate any words, keep numbers/units/brand names: "10 µl na
    1 ml RLT" -> "10 µl per 1 ml RLT"; "dla ≤ 5×10⁶ komórek" -> "for ≤ 5×10⁶
    cells"). If already English, copy it. If the volume depends on a condition,
    set `condition` (e.g. lysis buffer 350 µl WHEN "≤ 5×10⁶ komórek", 600 µl WHEN
    "większa liczba").
  - conditionals: [{condition, condition_en, then, then_en}] for branches
    (cell-count branch; Mini vs Micro kit; bulk vs single-cell). Keep condition/
    then in the ORIGINAL language and give English in condition_en/then_en
    ("≤ 5×10⁶ komórek" -> "≤ 5×10⁶ cells"; "użyć 350 µl RLT" -> "use 350 µl RLT").
  - repeat: {count, reason, reason_en}. POPULATE count for any "N times / N×/ N-krotnie /
    in triplicate / repeat N cycles": "wash three times" -> {count: 3}; "in
    triplicate" -> {count: 3}; "35 cycles" -> {count: 35}; "5-krotnie" -> {count: 5}.
    Use reason (no count) only for open-ended repeats: "Powtórzyć dla pozostałej
    objętości" -> {reason: "dla pozostałej objętości", reason_en: "for the
    remaining volume"}. Never drop the count into prose only. A `thermocycle` step
    MUST carry repeat.count = number of cycles.
  - alternatives: [Step-like] for EITHER/OR options that achieve the same goal
    (e.g. QIAshredder 2 min at max speed  OR  5× through a 20-21 G needle). List
    EVERY interchangeable method here — INCLUDING the default/first one — as its
    own step object with its OWN `action`, `text`, and `text_en`; a two-method
    "X or Y" instruction yields TWO alternatives, not one. The parent step's
    `text` is the shared goal ("Homogenize the lysate") and its `action` mirrors
    the default method, but the chooser and animation run the SELECTED
    alternative. Give each alternative the action that fits ITS method — the
    QIAshredder/spin-column option is "centrifuge", the needle/plunger/dounce
    option is "homogenize" (NOT "centrifuge", NOT "generic").
  - hazards: [string] in the ORIGINAL language. hazards_en: the SAME hazards in
    English, aligned by index. A hazard is a CAUTION, WARNING, or PROHIBITION —
    especially NEGATIVES and safety/handling risks. INCLUDE negative / critical
    instructions here, not just dangers. "Nie wirować" ("Do NOT centrifuge") IS a
    hazard; so are "do not exceed 45 s", "do not vortex", "do not let the membrane
    dry", "pod wyciągiem" (fume hood), "trzymać na lodzie" (keep on ice), "pracować
    szybko" (work quickly). A hazard is NOT a reagent, NOT a material, and NOT a
    plain condition: "cold transfer buffer" is a REAGENT (it belongs in `reagents`),
    "at 100 V" is a CONDITION (it belongs in the step text) — NEITHER is a hazard.
    Never put a bare reagent/material name in `hazards`.
  - prep_ahead: WHEN a preparation is made. TWO kinds, and the difference is real
    protocol knowledge the source text never states outright:
      • DO-AHEAD (prep_ahead: true) — a SHELF-STABLE mixture/buffer made ONCE before you
        start and good for the whole session: adding 2-mercaptoethanol to RLT lysis
        buffer, adding ethanol to the RPE/wash buffer, making up a fixative or a stock.
        These are lifted OUT of the timed run into the "before you start" checklist.
      • JUST-IN-TIME (prep_ahead: false) — made FRESH, immediately before the step that
        uses it, because it is unstable, ENZYMATIC, or the protocol implies freshness:
        a DNase I / RDD mix, any master mix CONTAINING enzyme, a reducing-agent mix, or
        anything marked "prepare fresh" / "use immediately" / light- or heat-sensitive.
        It STAYS in the run (shown right before its consumer) — give it `produces` and
        give the consuming step the matching `draws_from`. You do NOT make an enzyme mix
        and leave it on the bench for forty minutes; you make it when you need it.
    When in doubt choose JUST-IN-TIME (false): a prep shown a little early is a small
    error; one hidden in a checklist the user needed at the bench is a real one. Only
    preparations are ever prep_ahead — a step that acts on the sample (adds to it, keeps
    it on ice) is part of the run and is NEVER prep_ahead.
  - gaps: [{parameter, question}] for any value left underspecified / "to be
    determined" AT THIS STEP. Surface it as an answerable question (English is fine).
  - verbatim: the original source sentence(s) this step came from (audit trail).
    When one instruction is split into several atomic steps, copy the SAME
    original sentence into `verbatim` on EVERY derived step, so nothing is lost;
    `text`/`text_en` then describe only that step's single action.

PROTOCOL-LEVEL FIELDS
  - title, title_en, summary, summary_en, source.
  - materials: [{name, name_en, note, note_en}] from the reagents/materials
    section. Keep name/note in the ORIGINAL language and give English in
    name_en/note_en ("Bufor lizujący RLT" -> "RLT lysis buffer").
  - open_parameters: [{question, where, where_en}] — every protocol-wide decision
    left open: kit choice, input cell number, lysis/elution volumes, target RIN,
    bulk vs single-cell. Keep `where` in the original language and give English in
    where_en. Explicit "to be decided on site" text ("Do ustalenia na miejscu...")
    MUST become open_parameters. Questions may be in English.
  - reference: a STRING holding non-procedural content — comparison tables
    between protocols, reference/source/citation lists. This content MUST NOT
    appear as `steps`. Keep it (condensed is fine) only in `reference`.

EXCLUSIONS
  - Comparison tables (e.g. "Porównanie z innymi protokołami"), and source /
    citation lists ("Źródła") are NOT runnable steps. Never emit them as steps.
    Put them in `reference`.

Return JSON of exactly this shape:
{
  "title": str, "title_en": str,
  "summary": str, "summary_en": str,
  "source": str,
  "materials": [{"name": str, "name_en": str|null, "note": str|null, "note_en": str|null}],
  "steps": [{
    "index": int, "phase": str, "text": str, "text_en": str,
    "kind": str, "action": str,
    "container": str|null,   // where the SAMPLE sits (see CONTAINER rule); omit if unchanged
    "target": str,           // "sample" (default) or, for a `prepare` step, its own `produces` id
    "produces": str|null,    // `prepare` step only: snake_case id of the mixture it makes
    "draws_from": str|null,  // a step USING a prepared mixture: that mixture's `produces` id
    "duration_seconds": number|null,
    "spin": {"duration_seconds": number|null, "rcf_min": number|null, "note": str|null}|null,
    "reagents": [{"name": str, "name_en": str|null, "volume": str|null, "volume_en": str|null, "condition": str|null, "condition_en": str|null}],
    "conditionals": [{"condition": str, "condition_en": str|null, "then": str, "then_en": str|null}],
    "repeat": {"count": int|null, "reason": str|null, "reason_en": str|null}|null,
    "alternatives": [ <step-like object, with its own action/text/text_en> ],
    "hazards": [str], "hazards_en": [str],
    "prep_ahead": bool,
    "gaps": [{"parameter": str, "question": str}],
    "verbatim": str
  }],
  "open_parameters": [{"question": str, "where": str|null, "where_en": str|null}],
  "reference": str|null
}
"""

USER_TEMPLATE = """\
Parse the following laboratory protocol into the JSON schema. Keep the original
language in the base fields and add English in the parallel `_en` fields.

--- PROTOCOL START ---
{text}
--- PROTOCOL END ---
"""


# ---------------------------------------------------------------------------
# caching
# ---------------------------------------------------------------------------

def _cache_key(system: str, user: str) -> str:
    h = hashlib.sha256()
    h.update(system.encode("utf-8"))
    h.update(b"\x00")
    h.update(user.encode("utf-8"))
    return h.hexdigest()[:32]


def _cache_get(key: str) -> Optional[str]:
    path = os.path.join(_CACHE_DIR, key + ".txt")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as fh:
            return fh.read()
    return None


def _cache_put(key: str, value: str) -> None:
    os.makedirs(_CACHE_DIR, exist_ok=True)
    with open(os.path.join(_CACHE_DIR, key + ".txt"), "w", encoding="utf-8") as fh:
        fh.write(value)


# ---------------------------------------------------------------------------
# default LLM (Anthropic) — lazy, only built when no llm is injected
# ---------------------------------------------------------------------------

def default_llm(model: str = DEFAULT_MODEL, max_tokens: int = 32000) -> LLM:
    """Build an Anthropic-backed llm callable. Requires ANTHROPIC_API_KEY."""

    def _call(system: str, user: str) -> str:
        import anthropic  # lazy import

        client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env
        # Stream: the bilingual+action output is large, and the SDK requires
        # streaming for high max_tokens. We accumulate the full text and return it.
        parts: list[str] = []
        with client.messages.stream(
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        ) as stream:
            for text in stream.text_stream:
                parts.append(text)
        return "".join(parts)

    return _call


# ---------------------------------------------------------------------------
# JSON extraction (models sometimes wrap JSON in prose / fences)
# ---------------------------------------------------------------------------

def _extract_json(raw: str) -> dict:
    raw = raw.strip()
    # strip ```json ... ``` fences if present
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", raw, flags=re.S)
    if fence:
        raw = fence.group(1).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    # fall back to the outermost {...} span
    start, end = raw.find("{"), raw.rfind("}")
    if start != -1 and end != -1 and end > start:
        return json.loads(raw[start : end + 1])
    raise ValueError("Model response did not contain parseable JSON.")


# ---------------------------------------------------------------------------
# deterministic normalization — enforce invariants the LLM sometimes violates,
# independent of the prompt. Pure and idempotent so it is unit-testable offline.
# ---------------------------------------------------------------------------

# leading verbs that mean "remove liquid" — a `measure` that starts with one of
# these is a drain/blot, not a reading (Western "Drain the membrane …" mis-tag).
_DRAIN_LEAD = re.compile(
    r"^\s*(?:drain|blot|decant|wick|soak\s+off|pour\s+(?:off|away)|aspirate\s+off)\b",
    re.IGNORECASE,
)


def normalize_parsed(data: dict) -> dict:
    """Enforce parse invariants deterministically (see Stage 12):

    1. A hazard is a caution/warning/prohibition — never a bare reagent or material
       name. Drop any hazard string that EXACTLY matches a reagent/material name in
       the protocol (aligning the parallel `hazards_en` by index).
    2. `measure` requires a reading. A step whose instruction LEADS with a removal
       verb (drain/blot/decant/…) and names no instrument is a `discard`, not a
       measurement.

    Container-on-move is intentionally NOT auto-filled here: a missing destination on
    a transfer/elute/seed is a real defect the renderer guard must surface, not one
    to silently paper over.
    """
    if not isinstance(data, dict):
        return data

    # names that are reagents/materials, not hazards — exact-match, case-folded.
    names: set[str] = set()
    for m in data.get("materials") or []:
        for k in ("name", "name_en"):
            v = (m or {}).get(k)
            if v and v.strip():
                names.add(v.strip().casefold())
    for s in data.get("steps") or []:
        for r in s.get("reagents") or []:
            for k in ("name", "name_en"):
                v = (r or {}).get(k)
                if v and v.strip():
                    names.add(v.strip().casefold())

    for s in data.get("steps") or []:
        # 1 — strip reagent/material names that leaked into hazards
        hz = s.get("hazards") or []
        if hz:
            hz_en = s.get("hazards_en") or []
            keep, keep_en = [], []
            for i, h in enumerate(hz):
                is_name = isinstance(h, str) and h.strip().casefold() in names
                if is_name:
                    continue
                keep.append(h)
                if i < len(hz_en):
                    keep_en.append(hz_en[i])
            s["hazards"] = keep
            if "hazards_en" in s:
                s["hazards_en"] = keep_en if hz_en else s["hazards_en"]

        # 2 — a drain/blot mis-tagged as measure is really a discard
        if s.get("action") == "measure":
            lead = s.get("text_en") or s.get("text") or ""
            if _DRAIN_LEAD.search(lead):
                s["action"] = "discard"
                if s.get("kind") == "measure":
                    s["kind"] = "action"

    return data


# ---------------------------------------------------------------------------
# preparations: a WHICH-vessel and a WHEN (Stage 34). Pure + idempotent.
# ---------------------------------------------------------------------------

def _slug(text: str) -> str:
    """snake_case id for matching a `produces` to a `draws_from` loosely."""
    return re.sub(r"[^a-z0-9]+", "_", _s(text).lower()).strip("_")


def arrange_preparations(data: dict) -> dict:
    """Give every step a `target`, name every preparation's product, and move each
    JUST-IN-TIME preparation to sit immediately before the step that consumes it.

    Once the bench can hold more than one vessel (the sample + any mix a `prepare`
    step makes), an instruction is ambiguous unless it says WHICH vessel it acts on
    (Part 1), and an enzyme mix made forty minutes early is a lie about HOW you work
    (Part 2). Both are fixed here, deterministically:

    1. Every step declares a `target`: "sample" by default; a `prepare` step targets
       its OWN product (never the sample). Every `prepare` names that product in
       `produces` (synthesized if the model forgot, so the invariant always holds).
    2. A just-in-time prep (`prepare`, prep_ahead=false) is moved to immediately before
       the FIRST later step that `draws_from` its product. Do-ahead preps (prep_ahead=
       true) stay put — the UI lifts them into the before-you-start checklist. NOTHING
       else moves, and `source_index` keeps the emitted order recoverable.
    """
    if not isinstance(data, dict):
        return data
    steps = data.get("steps")
    if not isinstance(steps, list) or not steps:
        return data

    # 1 — audit trail: remember the emitted (source) order before any reordering.
    for i, s in enumerate(steps):
        if isinstance(s, dict) and s.get("source_index") is None:
            s["source_index"] = i

    # 2 — every step says WHAT it acts on. A `prepare` acts on its own product; the
    #     product NEVER becomes the sample's target.
    for s in steps:
        if not isinstance(s, dict):
            continue
        if s.get("action") == "prepare":
            prod = _s(s.get("produces")) or f"prep_{int(s.get('source_index') or 0) + 1}"
            s["produces"] = prod
            s["target"] = prod
        elif not _s(s.get("target")):
            s["target"] = "sample"

    # 3 — move each just-in-time prep to immediately before its first consumer.
    def _consumer_index(prod: str, start: int) -> int:
        key = _slug(prod)
        for j in range(start, len(steps)):
            s = steps[j]
            if isinstance(s, dict) and s.get("action") != "prepare":
                df = s.get("draws_from")
                if df and (_s(df) == prod or _slug(df) == key):
                    return j
        return -1

    i = 0
    while i < len(steps):
        s = steps[i]
        if (isinstance(s, dict) and s.get("action") == "prepare"
                and not bool(s.get("prep_ahead"))):
            j = _consumer_index(s.get("produces"), i + 1)
            if j > i + 1:                 # a consumer exists, and it is NOT already adjacent
                steps.pop(i)
                steps.insert(j - 1, s)    # pop shifted the consumer to j-1; land just before it
                s["phase"] = "procedure"  # it now lives inside the timed run, not the prep block
                continue                  # re-examine whatever slid into position i
        i += 1

    return data


# ---------------------------------------------------------------------------
# public API
# ---------------------------------------------------------------------------

def parse_protocol(
    text: str,
    llm: Optional[LLM] = None,
    source: str = "",
    use_cache: bool = True,
) -> Protocol:
    """Parse protocol `text` into a `Protocol` using a single, cached llm call.

    `llm` is injectable: pass a fake for tests/offline. If omitted, a default
    Anthropic client is used (needs ANTHROPIC_API_KEY).
    """
    if llm is None:
        llm = default_llm()

    user = USER_TEMPLATE.format(text=text)
    key = _cache_key(SYSTEM_PROMPT, user)

    raw: Optional[str] = _cache_get(key) if use_cache else None
    if raw is None:
        raw = llm(SYSTEM_PROMPT, user)
        if use_cache:
            _cache_put(key, raw)

    data = arrange_preparations(normalize_parsed(_extract_json(raw)))
    return Protocol.from_dict(data, source=source)
