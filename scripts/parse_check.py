"""Legible fidelity check.

Run parse on a protocol (default: the neutrophil RNA .docx in examples/), write
outputs/parsed.json and a NON-pretty but LEGIBLE outputs/parsed_preview.html so a
human can eyeball parse fidelity against docs/spike_targets.md.

Usage:
    python scripts/parse_check.py [examples/<file>.docx]

Needs ANTHROPIC_API_KEY (unless a cached response for this exact input exists).
"""

from __future__ import annotations

import glob
import html
import json
import os
import sys

# make `core` importable when run as a script
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.ingest import ingest          # noqa: E402
from core.parse import parse_protocol    # noqa: E402
from core.schema import Protocol, Step   # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "outputs")


def _default_input() -> str:
    hits = sorted(glob.glob(os.path.join(ROOT, "examples", "*.docx")))
    if not hits:
        hits = sorted(glob.glob(os.path.join(ROOT, "examples", "*")))
    if not hits:
        raise SystemExit("No protocol found in examples/. Pass a path explicitly.")
    return hits[0]


# ---------------------------------------------------------------------------
# HTML rendering — legible, not pretty. Everything on the checklist must be
# visible at a glance.
# ---------------------------------------------------------------------------

def esc(v) -> str:
    return html.escape(str(v)) if v is not None else ""


def fmt_duration(seconds) -> str:
    if not seconds:
        return ""
    seconds = float(seconds)
    if seconds >= 3600:
        h = seconds / 3600
        return f"{h:g} h"
    if seconds >= 60:
        return f"{seconds / 60:g} min"
    return f"{seconds:g} s"


PHASE_ORDER = ["preparation", "procedure", "quality_control", "notes"]
PHASE_LABEL = {
    "preparation": "Preparation",
    "procedure": "Procedure",
    "quality_control": "Quality control",
    "notes": "Notes",
}


def render_step(step: Step, nested: bool = False) -> str:
    parts = ['<li class="step%s">' % (" nested" if nested else "")]

    badges = [f'<span class="badge kind-{esc(step.kind)}">{esc(step.kind)}</span>']
    badges.append(f'<span class="badge phase">{esc(step.phase)}</span>')
    if step.prep_ahead:
        badges.append('<span class="badge prep">prep-ahead</span>')
    if step.duration_seconds:
        badges.append(f'<span class="badge timer">⏱ {esc(fmt_duration(step.duration_seconds))}</span>')
    parts.append('<div class="badges">' + "".join(badges) + "</div>")

    parts.append(f'<div class="text">{esc(step.text)}</div>')

    if step.spin:
        s = step.spin
        bits = []
        if s.duration_seconds:
            bits.append(f"⏱ {esc(fmt_duration(s.duration_seconds))}")
        if s.rcf_min:
            bits.append(f"≥ {esc(s.rcf_min)} ×g")
        if s.note:
            bits.append(esc(s.note))
        parts.append('<div class="spin">🌀 spin: ' + " · ".join(bits) + "</div>")

    if step.reagents:
        rows = []
        for r in step.reagents:
            vol = f' — <b>{esc(r.volume)}</b>' if r.volume else ""
            cond = f' <span class="cond">if {esc(r.condition)}</span>' if r.condition else ""
            rows.append(f"<li>{esc(r.name)}{vol}{cond}</li>")
        parts.append('<div class="reagents"><span class="lbl">reagents</span><ul>' + "".join(rows) + "</ul></div>")

    for c in step.conditionals:
        parts.append(
            f'<div class="conditional">🔀 <b>if</b> {esc(c.condition)} '
            f'<b>→</b> {esc(c.then)}</div>'
        )

    if step.repeat:
        rp = step.repeat
        label = []
        if rp.count is not None:
            label.append(f"×{esc(rp.count)}")
        if rp.reason:
            label.append(esc(rp.reason))
        parts.append('<div class="repeat">🔁 repeat: ' + " — ".join(label) + "</div>")

    if step.alternatives:
        parts.append('<div class="alternatives"><span class="lbl">either / or</span><ol>')
        for alt in step.alternatives:
            parts.append(render_step(alt, nested=True))
        parts.append("</ol></div>")

    for h in step.hazards:
        neg = any(t in h.lower() for t in ["nie ", "not ", "do not", "don't", "unikać", "avoid", "never"])
        cls = "hazard neg" if neg else "hazard"
        icon = "⛔" if neg else "⚠️"
        parts.append(f'<div class="{cls}">{icon} {esc(h)}</div>')

    for g in step.gaps:
        parts.append(
            f'<div class="gap">❓ <b>{esc(g.parameter)}</b>: {esc(g.question)}</div>'
        )

    if step.verbatim:
        parts.append(f'<details class="verbatim"><summary>source</summary>{esc(step.verbatim)}</details>')

    parts.append("</li>")
    return "".join(parts)


def render_html(p: Protocol) -> str:
    open_params = "".join(
        f'<li>❓ {esc(op.question)}'
        + (f' <span class="where">({esc(op.where)})</span>' if op.where else "")
        + "</li>"
        for op in p.open_parameters
    )

    materials = "".join(
        f"<li>{esc(m.name)}" + (f" <span class='note'>— {esc(m.note)}</span>" if m.note else "") + "</li>"
        for m in p.materials
    )

    # steps grouped by phase, preserving order
    phases_html = []
    for phase in PHASE_ORDER:
        steps = [s for s in p.steps if s.phase == phase]
        if not steps:
            continue
        items = "".join(render_step(s) for s in steps)
        phases_html.append(
            f'<section class="phase-block"><h2>{esc(PHASE_LABEL.get(phase, phase))} '
            f'<span class="count">({len(steps)})</span></h2><ol class="steps">{items}</ol></section>'
        )
    # any steps with an unexpected phase
    other = [s for s in p.steps if s.phase not in PHASE_ORDER]
    if other:
        items = "".join(render_step(s) for s in other)
        phases_html.append(f'<section class="phase-block"><h2>Other</h2><ol class="steps">{items}</ol></section>')

    reference = (
        f'<section class="reference"><h2>Reference (excluded from runnable steps)</h2>'
        f'<pre>{esc(p.reference)}</pre></section>'
        if p.reference
        else ""
    )

    return f"""<!doctype html>
<html lang="und"><head><meta charset="utf-8">
<title>benchpilot — parse preview</title>
<style>
  body {{ font: 15px/1.5 -apple-system, system-ui, sans-serif; max-width: 960px;
         margin: 0 auto; padding: 24px; color: #1a1a1a; }}
  h1 {{ margin-bottom: 4px; }}
  .summary {{ color: #444; }}
  .source {{ color: #888; font-size: 13px; }}
  .panel {{ background: #fff8e1; border: 1px solid #f0d98a; border-radius: 8px;
            padding: 12px 16px; margin: 16px 0; }}
  .panel h2 {{ margin: 0 0 8px; font-size: 15px; }}
  .panel ul {{ margin: 0; padding-left: 18px; }}
  .materials {{ background: #f4f6f8; border: 1px solid #dde3e8; border-radius: 8px;
                padding: 12px 16px; margin: 16px 0; }}
  .phase-block h2 {{ border-bottom: 2px solid #ddd; padding-bottom: 4px; }}
  .count {{ color: #999; font-weight: normal; font-size: 14px; }}
  ol.steps {{ list-style: none; padding: 0; }}
  li.step {{ border: 1px solid #e2e2e2; border-radius: 8px; padding: 12px 14px;
             margin: 10px 0; background: #fff; }}
  li.step.nested {{ background: #fbfbfb; margin: 6px 0; }}
  .badges {{ margin-bottom: 6px; }}
  .badge {{ display: inline-block; font-size: 11px; padding: 2px 7px; border-radius: 10px;
            margin-right: 5px; background: #eee; color: #333; text-transform: uppercase;
            letter-spacing: .3px; }}
  .badge.phase {{ background: #e7edf5; }}
  .badge.prep {{ background: #d7f0d7; color: #175217; }}
  .badge.timer {{ background: #fde9c8; color: #7a4b00; }}
  .badge.kind-spin {{ background: #e3d7f0; }}
  .badge.kind-wait {{ background: #d7ecf0; }}
  .badge.kind-caution {{ background: #f5d7d7; }}
  .badge.kind-storage {{ background: #d7dff5; }}
  .badge.kind-measure {{ background: #d7f0e8; }}
  .badge.kind-prepare {{ background: #d7f0d7; }}
  .text {{ font-weight: 500; }}
  .spin, .repeat {{ margin-top: 6px; font-size: 14px; color: #444; }}
  .reagents, .alternatives {{ margin-top: 6px; }}
  .reagents ul, .alternatives ol {{ margin: 2px 0; padding-left: 20px; }}
  .lbl {{ font-size: 11px; text-transform: uppercase; letter-spacing: .3px; color: #888; }}
  .cond {{ color: #6a4b00; background: #fdf0d5; padding: 0 4px; border-radius: 4px; }}
  .conditional {{ margin-top: 6px; background: #eef4ff; border-left: 3px solid #5b8def;
                  padding: 4px 8px; border-radius: 0 4px 4px 0; }}
  .hazard {{ margin-top: 6px; background: #fff4e0; border-left: 3px solid #e0912f;
             padding: 4px 8px; border-radius: 0 4px 4px 0; }}
  .hazard.neg {{ background: #fdeaea; border-left-color: #d33; color: #a10000; font-weight: 600; }}
  .gap {{ margin-top: 6px; background: #fff7cc; border-left: 3px solid #e0c000;
          padding: 4px 8px; border-radius: 0 4px 4px 0; }}
  details.verbatim {{ margin-top: 8px; font-size: 12px; color: #777; }}
  details.verbatim summary {{ cursor: pointer; }}
  .reference pre {{ white-space: pre-wrap; background: #f4f6f8; padding: 12px;
                    border-radius: 8px; font-size: 13px; color: #555; }}
  .note, .where {{ color: #888; }}
</style></head><body>
  <h1>{esc(p.title)}</h1>
  <div class="summary">{esc(p.summary)}</div>
  <div class="source">source: {esc(p.source)}</div>

  <section class="panel">
    <h2>Open parameters — decide before running ({len(p.open_parameters)})</h2>
    <ul>{open_params or "<li>(none)</li>"}</ul>
  </section>

  <section class="materials">
    <h2>Materials ({len(p.materials)})</h2>
    <ul>{materials or "<li>(none)</li>"}</ul>
  </section>

  {''.join(phases_html)}
  {reference}
</body></html>"""


def main() -> None:
    inp = sys.argv[1] if len(sys.argv) > 1 else _default_input()
    print(f"[parse_check] input: {inp}")
    text = ingest(inp)
    print(f"[parse_check] extracted {len(text)} chars of text")

    protocol = parse_protocol(text, source=os.path.basename(inp))
    print(f"[parse_check] parsed: {len(protocol.steps)} steps, "
          f"{len(protocol.open_parameters)} open parameters, "
          f"{len(protocol.materials)} materials")

    os.makedirs(OUT_DIR, exist_ok=True)
    json_path = os.path.join(OUT_DIR, "parsed.json")
    with open(json_path, "w", encoding="utf-8") as fh:
        json.dump(protocol.to_dict(), fh, ensure_ascii=False, indent=2)
    print(f"[parse_check] wrote {json_path}")

    html_path = os.path.join(OUT_DIR, "parsed_preview.html")
    with open(html_path, "w", encoding="utf-8") as fh:
        fh.write(render_html(protocol))
    print(f"[parse_check] wrote {html_path}")
    print("[parse_check] open the preview and judge against docs/spike_targets.md")


if __name__ == "__main__":
    main()
