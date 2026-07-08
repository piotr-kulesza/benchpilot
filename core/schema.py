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


# ---------------------------------------------------------------------------
# nested value objects
# ---------------------------------------------------------------------------

@dataclass
class Reagent:
    """A reagent added at a step. `volume` may be conditional (see `condition`)."""
    name: str = ""
    volume: Optional[str] = None      # kept as free text: "350 µl", "10 µl/próbkę"
    condition: Optional[str] = None   # e.g. "dla ≤ 5×10⁶ komórek"

    @classmethod
    def from_dict(cls, d: Any) -> "Reagent":
        if isinstance(d, str):
            return cls(name=d.strip())
        d = d or {}
        return cls(
            name=_s(d.get("name")),
            volume=_opt_s(d.get("volume")),
            condition=_opt_s(d.get("condition")),
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
    text: str = ""                      # cleaned, human-readable instruction
    kind: str = "action"
    duration_seconds: Optional[float] = None
    spin: Optional[Spin] = None
    reagents: list[Reagent] = field(default_factory=list)
    conditionals: list[Conditional] = field(default_factory=list)
    repeat: Optional[Repeat] = None
    alternatives: list["Step"] = field(default_factory=list)  # either/or variants
    hazards: list[str] = field(default_factory=list)          # incl. negatives
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
            kind=kind,
            duration_seconds=_opt_num(d.get("duration_seconds")),
            spin=Spin.from_dict(d.get("spin")),
            reagents=[Reagent.from_dict(r) for r in _list(d.get("reagents"))],
            conditionals=[Conditional.from_dict(c) for c in _list(d.get("conditionals"))],
            repeat=Repeat.from_dict(d.get("repeat")),
            alternatives=alternatives,
            hazards=[_s(h) for h in _list(d.get("hazards")) if _s(h)],
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
    summary: str = ""
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
            summary=_s(d.get("summary")),
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
