"""Structured representation of a lab protocol.

This module is the intellectual core of benchpilot: it defines the target shape
that any messy protocol text is parsed into. It is pure data — no I/O, no LLM,
no web. The parser (`core.parse`) fills these dataclasses; renderers consume them.

The classes are deliberately tolerant: every `from_dict` accepts partial / noisy
JSON (missing keys, wrong types) and coerces sanely, because the JSON comes from
a language model and we never want a single malformed field to crash the parse.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any, Optional

# ---------------------------------------------------------------------------
# Controlled vocabularies (soft — unknown values are kept verbatim, not rejected)
# ---------------------------------------------------------------------------

PHASES = ("preparation", "procedure", "quality_control", "notes")
KINDS = ("action", "wait", "spin", "prepare", "measure", "caution", "storage")

# FIXED animation vocabulary — the frontend must ship exactly one looping visual
# per value. Anything unrecognized is coerced to "generic" so nothing renders
# blank and no missing-case ever crashes the renderer.
ACTIONS = (
    "pour_add",       # add / pour a liquid into a vessel
    "pipette_mix",    # pipette / resuspend / mix by pipetting
    "vortex_mix",     # vortex / flick / invert
    "homogenize",     # manual homogenization — pass through a needle / plunge / dounce (NOT a spin)
    "centrifuge",     # spin
    "incubate_wait",  # timed wait at a stated temperature
    "heat",           # heat shock / water bath
    "cool_ice",       # place on / keep on ice
    "transfer",       # move sample to a new tube / column
    "wash",           # add wash buffer + spin-through
    "discard",        # discard flow-through / waste
    "elute",          # final elution
    "measure",        # QC / read on an instrument
    "generic",        # fallback
)


# ---------------------------------------------------------------------------
# small coercion helpers
# ---------------------------------------------------------------------------

def _s(v: Any) -> str:
    """Coerce to a stripped string; None -> ''."""
    if v is None:
        return ""
    return str(v).strip()


def _opt_s(v: Any) -> Optional[str]:
    s = _s(v)
    return s or None


def _opt_num(v: Any) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        f = float(v)
        # keep ints as ints for clean display
        return int(f) if f.is_integer() else f
    except (TypeError, ValueError):
        return None


def _list(v: Any) -> list:
    if v is None:
        return []
    if isinstance(v, list):
        return v
    return [v]


def _action(v: Any) -> str:
    """Coerce to a value in the fixed ACTIONS vocabulary; unknown -> 'generic'."""
    s = _s(v).lower()
    return s if s in ACTIONS else "generic"


# ---------------------------------------------------------------------------
# nested value objects
# ---------------------------------------------------------------------------

@dataclass
class Reagent:
    """A reagent added at a step. `volume` may be conditional (see `condition`).

    `volume`/`condition` are kept verbatim in the original language; `volume_en`/
    `condition_en` carry English renderings so the default UI never leaks the
    source language (e.g. "10 µl na 1 ml RLT" -> "10 µl per 1 ml RLT").
    """
    name: str = ""                    # original language (verbatim)
    name_en: Optional[str] = None     # English rendering for comprehension
    volume: Optional[str] = None      # kept as free text: "350 µl", "10 µl/próbkę"
    volume_en: Optional[str] = None   # English rendering of `volume`
    condition: Optional[str] = None   # e.g. "dla ≤ 5×10⁶ komórek"
    condition_en: Optional[str] = None  # English rendering of `condition`

    @classmethod
    def from_dict(cls, d: Any) -> "Reagent":
        if isinstance(d, str):
            return cls(name=d.strip())
        d = d or {}
        return cls(
            name=_s(d.get("name")),
            name_en=_opt_s(d.get("name_en")),
            volume=_opt_s(d.get("volume")),
            volume_en=_opt_s(d.get("volume_en")),
            condition=_opt_s(d.get("condition")),
            condition_en=_opt_s(d.get("condition_en")),
        )


@dataclass
class Spin:
    """A centrifugation instruction."""
    duration_seconds: Optional[float] = None
    rcf_min: Optional[float] = None   # minimum relative centrifugal force (× g)
    note: Optional[str] = None

    @classmethod
    def from_dict(cls, d: Any) -> Optional["Spin"]:
        if not d:
            return None
        return cls(
            duration_seconds=_opt_num(d.get("duration_seconds")),
            rcf_min=_opt_num(d.get("rcf_min")),
            note=_opt_s(d.get("note")),
        )


@dataclass
class Conditional:
    """A branch: if `condition` holds, do `then`."""
    condition: str = ""
    then: str = ""

    @classmethod
    def from_dict(cls, d: Any) -> "Conditional":
        d = d or {}
        return cls(condition=_s(d.get("condition")), then=_s(d.get("then")))


@dataclass
class Repeat:
    """Repeat instruction: a fixed `count`, and/or a `reason`."""
    count: Optional[int] = None
    reason: Optional[str] = None

    @classmethod
    def from_dict(cls, d: Any) -> Optional["Repeat"]:
        if not d:
            return None
        cnt = _opt_num(d.get("count"))
        return cls(
            count=int(cnt) if cnt is not None else None,
            reason=_opt_s(d.get("reason")),
        )


@dataclass
class Gap:
    """An underspecified parameter surfaced as an answerable question."""
    parameter: str = ""
    question: str = ""

    @classmethod
    def from_dict(cls, d: Any) -> "Gap":
        d = d or {}
        return cls(parameter=_s(d.get("parameter")), question=_s(d.get("question")))


@dataclass
class OpenParameter:
    """A protocol-level open decision (kit, input, target metric, ...)."""
    question: str = ""
    where: Optional[str] = None   # where in the protocol it bites

    @classmethod
    def from_dict(cls, d: Any) -> "OpenParameter":
        d = d or {}
        return cls(question=_s(d.get("question")), where=_opt_s(d.get("where")))


@dataclass
class Material:
    name: str = ""
    note: Optional[str] = None

    @classmethod
    def from_dict(cls, d: Any) -> "Material":
        if isinstance(d, str):
            return cls(name=d.strip())
        d = d or {}
        return cls(name=_s(d.get("name")), note=_opt_s(d.get("note")))


# ---------------------------------------------------------------------------
# Step
# ---------------------------------------------------------------------------

@dataclass
class Step:
    index: int = 0
    phase: str = "procedure"
    text: str = ""                      # cleaned instruction, ORIGINAL language (verbatim-faithful)
    text_en: Optional[str] = None       # English translation for the default UI
    kind: str = "action"
    action: str = "generic"             # animation vocabulary (see ACTIONS)
    duration_seconds: Optional[float] = None
    spin: Optional[Spin] = None
    reagents: list[Reagent] = field(default_factory=list)
    conditionals: list[Conditional] = field(default_factory=list)
    repeat: Optional[Repeat] = None
    alternatives: list["Step"] = field(default_factory=list)  # either/or variants
    hazards: list[str] = field(default_factory=list)          # incl. negatives, original language
    hazards_en: list[str] = field(default_factory=list)       # English, aligned by index with `hazards`
    prep_ahead: bool = False
    gaps: list[Gap] = field(default_factory=list)
    verbatim: str = ""                  # original source line (audit trail)

    @classmethod
    def from_dict(cls, d: Any, index: int = 0, _depth: int = 0) -> "Step":
        d = d or {}
        phase = _s(d.get("phase")) or "procedure"
        kind = _s(d.get("kind")) or "action"

        # alternatives are Step-like; guard against pathological recursion.
        alternatives: list[Step] = []
        if _depth < 3:
            for i, alt in enumerate(_list(d.get("alternatives"))):
                alternatives.append(cls.from_dict(alt, index=i, _depth=_depth + 1))

        return cls(
            index=int(_opt_num(d.get("index")) or index),
            phase=phase,
            text=_s(d.get("text")),
            text_en=_opt_s(d.get("text_en")),
            kind=kind,
            action=_action(d.get("action")),
            duration_seconds=_opt_num(d.get("duration_seconds")),
            spin=Spin.from_dict(d.get("spin")),
            reagents=[Reagent.from_dict(r) for r in _list(d.get("reagents"))],
            conditionals=[Conditional.from_dict(c) for c in _list(d.get("conditionals"))],
            repeat=Repeat.from_dict(d.get("repeat")),
            alternatives=alternatives,
            hazards=[_s(h) for h in _list(d.get("hazards")) if _s(h)],
            hazards_en=[_s(h) for h in _list(d.get("hazards_en")) if _s(h)],
            prep_ahead=bool(d.get("prep_ahead", False)),
            gaps=[Gap.from_dict(g) for g in _list(d.get("gaps"))],
            verbatim=_s(d.get("verbatim")),
        )


# ---------------------------------------------------------------------------
# Protocol (root)
# ---------------------------------------------------------------------------

@dataclass
class Protocol:
    title: str = ""
    title_en: Optional[str] = None      # English title for the default UI
    summary: str = ""
    summary_en: Optional[str] = None    # English summary for the default UI
    source: str = ""                    # provenance of the input (filename, etc.)
    materials: list[Material] = field(default_factory=list)
    steps: list[Step] = field(default_factory=list)
    open_parameters: list[OpenParameter] = field(default_factory=list)
    reference: Optional[str] = None     # non-procedural: comparison tables, sources

    @classmethod
    def from_dict(cls, d: Any, source: str = "") -> "Protocol":
        d = d or {}
        steps = [
            Step.from_dict(s, index=i + 1)
            for i, s in enumerate(_list(d.get("steps")))
        ]
        return cls(
            title=_s(d.get("title")),
            title_en=_opt_s(d.get("title_en")),
            summary=_s(d.get("summary")),
            summary_en=_opt_s(d.get("summary_en")),
            source=_s(d.get("source")) or source,
            materials=[Material.from_dict(m) for m in _list(d.get("materials"))],
            steps=steps,
            open_parameters=[
                OpenParameter.from_dict(p) for p in _list(d.get("open_parameters"))
            ],
            reference=_opt_s(d.get("reference")),
        )

    def to_dict(self) -> dict:
        """Plain-dict form (JSON-serializable) for outputs/parsed.json."""
        return asdict(self)
