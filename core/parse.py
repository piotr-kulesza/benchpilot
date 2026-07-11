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

from .schema import Protocol

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
- ADDITIONALLY provide an English translation in the parallel `_en` fields
  (`title_en`, `summary_en`, step `text_en`, reagent `name_en`, `hazards_en`).
  Translate faithfully; keep numbers, units, reagent brand names (RLT, RPE,
  QIAshredder, RNeasy) and symbols intact. If a field is already English, copy it.
- Output ONE JSON object and nothing else. No markdown fences, no commentary.
- Parse the WHOLE protocol in this single response.

WHAT TO EXTRACT

Split the protocol into `steps`. Assign each step a `phase`:
  "preparation"     - things to set up / make fresh before the procedure clock
  "procedure"       - the numbered wet-lab procedure
  "quality_control" - QC / measurement / acceptance criteria
  "notes"           - caveats, troubleshooting, general remarks

Assign each step a `kind` from:
  action, wait, spin, prepare, measure, caution, storage.

Assign each step ONE `action` from this FIXED animation vocabulary (best-effort;
if none fits, use "generic"):
  "pour_add"      - add / pour a liquid (buffer, ethanol) into a vessel
  "pipette_mix"   - pipette, resuspend, or mix by pipetting
  "vortex_mix"    - vortex, flick, or invert to mix
  "centrifuge"    - centrifuge / spin (wirować)
  "incubate_wait" - a timed wait / incubation at a stated temperature
  "heat"          - heat shock / water bath at an elevated temperature
  "cool_ice"      - place on / keep on ice
  "transfer"      - move the sample to a new tube or column
  "wash"          - add a wash buffer then spin it through
  "discard"       - discard flow-through / waste (odrzucić przesącz)
  "elute"         - the final elution of the product
  "measure"       - QC / read on an instrument (NanoDrop, Bioanalyzer)
  "generic"       - fallback when nothing above fits
  Choose the action that best matches the PRIMARY physical motion of the step.
  A wash step that is "add RPE, then spin" is "wash", not "centrifuge". A column
  load "transfer sample then spin, discard flow-through" is "transfer".

For each step extract, when present:
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
  - conditionals: [{condition, then}] for branches (cell-count branch; Mini vs
    Micro kit; bulk vs single-cell). May be phrased in English.
  - repeat: {count, reason}. e.g. "Powtórzyć dla pozostałej objętości" ->
    {reason: "dla pozostałej objętości"}. "5-krotnie" -> {count: 5}.
  - alternatives: [Step-like] for EITHER/OR options that achieve the same goal
    (e.g. QIAshredder 2 min at max speed  OR  5× through a 20-21 G needle). Put
    each alternative as its own step object inside this list, with its OWN
    `action`, `text`, and `text_en`.
  - hazards: [string] in the ORIGINAL language. hazards_en: the SAME hazards in
    English, aligned by index. INCLUDE negative / critical instructions here, not
    just dangers. "Nie wirować" ("Do NOT centrifuge") IS a hazard. So are "pod
    wyciągiem" (fume hood), "trzymać na lodzie" (keep on ice), "pracować szybko".
  - prep_ahead: true if this should be done BEFORE the procedure clock starts
    (making fresh buffer, premixing DNase I + RDD, etc.).
  - gaps: [{parameter, question}] for any value left underspecified / "to be
    determined" AT THIS STEP. Surface it as an answerable question (English is fine).
  - verbatim: the original source line(s) this step came from (audit trail).

PROTOCOL-LEVEL FIELDS
  - title, title_en, summary, summary_en, source.
  - materials: [{name, note}] from the reagents/materials section.
  - open_parameters: [{question, where}] — every protocol-wide decision left
    open: kit choice, input cell number, lysis/elution volumes, target RIN, bulk
    vs single-cell. Explicit "to be decided on site" text ("Do ustalenia na
    miejscu...") MUST become open_parameters. Questions may be in English.
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
  "materials": [{"name": str, "note": str|null}],
  "steps": [{
    "index": int, "phase": str, "text": str, "text_en": str,
    "kind": str, "action": str,
    "duration_seconds": number|null,
    "spin": {"duration_seconds": number|null, "rcf_min": number|null, "note": str|null}|null,
    "reagents": [{"name": str, "name_en": str|null, "volume": str|null, "volume_en": str|null, "condition": str|null, "condition_en": str|null}],
    "conditionals": [{"condition": str, "then": str}],
    "repeat": {"count": int|null, "reason": str|null}|null,
    "alternatives": [ <step-like object, with its own action/text/text_en> ],
    "hazards": [str], "hazards_en": [str],
    "prep_ahead": bool,
    "gaps": [{"parameter": str, "question": str}],
    "verbatim": str
  }],
  "open_parameters": [{"question": str, "where": str|null}],
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

    data = _extract_json(raw)
    return Protocol.from_dict(data, source=source)
