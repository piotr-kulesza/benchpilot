// The animation set — one looping SVG scene per action in the fixed vocabulary.
// Shared visual language (see animations.css): teal liquid, frosted glass tubes,
// amber heat, blue ice. Every scene animates transform/opacity only (60fps).
//
// Timed scenes (incubate_wait, heat, centrifuge) accept a `timer` prop
// { fraction, remaining, running } so the countdown ring / rotor is the SAME
// clock the runner counts down — no duplicate timers.

import { useId } from 'react'
import { formatDuration } from '../lib/runtime.js'

const VB = '0 0 240 180'

// ---------------------------------------------------------------------------
// shared primitives
// ---------------------------------------------------------------------------

// A microcentrifuge tube with an (optionally animated) liquid fill.
function Tube({ cx = 120, top = 46, w = 46, h = 96, level = 0.5, animateFill = false, tilt = 0 }) {
  // useId() returns colon-wrapped ids (":r0:") that break SVG url(#..) refs — strip them.
  const clip = 'clip-' + useId().replace(/:/g, '')
  const left = cx - w / 2
  const r = w / 2
  const liquidH = h * level
  const liquidY = top + h - liquidH
  return (
    <g transform={tilt ? `rotate(${tilt} ${cx} ${top + h})` : undefined}>
      <clipPath id={clip}>
        <rect x={left + 3} y={top + 3} width={w - 6} height={h - 6} rx={r - 3} />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        <rect
          className={animateFill ? 'liquid-fill' : ''}
          x={left + 3}
          y={liquidY}
          width={w - 6}
          height={liquidH + 6}
          fill="var(--liquid)"
        />
        <rect x={left + 3} y={liquidY - 3} width={w - 6} height={5} fill="var(--liquid-soft)" opacity="0.8" />
      </g>
      <rect x={left} y={top} width={w} height={h} rx={r} fill="var(--glass)" opacity="0.32" />
      <rect
        x={left}
        y={top}
        width={w}
        height={h}
        rx={r}
        fill="none"
        stroke="var(--glass-edge)"
        strokeWidth="2.5"
      />
      <ellipse cx={cx} cy={top} rx={r} ry="5" fill="var(--glass-edge)" opacity="0.5" />
    </g>
  )
}

// A silica spin-column sitting in a collection tube.
function Column({ cx = 120, top = 40 }) {
  const left = cx - 26
  return (
    <g>
      <rect x={left - 4} y={top + 44} width={60} height={70} rx={12} fill="var(--glass)" opacity="0.3" stroke="var(--glass-edge)" strokeWidth="2.5" />
      <rect x={left} y={top} width={52} height={52} rx={8} fill="var(--glass)" opacity="0.45" stroke="var(--glass-edge)" strokeWidth="2.5" />
      <rect x={left + 4} y={top + 40} width={44} height={7} rx={3} fill="var(--metal)" />
      <line x1={left + 8} y1={top + 43} x2={left + 44} y2={top + 43} stroke="var(--metal-dark)" strokeWidth="1.4" />
    </g>
  )
}

// The countdown ring shared by timed scenes; fraction is remaining/total (1→0).
function CountdownRing({ fraction = 1, color = 'var(--liquid)', cx = 120, cy = 84, r = 60, children }) {
  const C = 2 * Math.PI * r
  const offset = C * (1 - Math.max(0, Math.min(1, fraction)))
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--glass)" strokeWidth="9" opacity="0.5" />
      <circle
        className="ring-fg"
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      {children}
    </g>
  )
}

function Drop({ cx, cy, className, color = 'var(--liquid)', r = 5 }) {
  // cx/cy/r often arrive as JSX string props — coerce so arithmetic doesn't concat.
  const x = Number(cx)
  const y = Number(cy)
  const rr = Number(r)
  return (
    <path
      className={className}
      d={`M ${x} ${y - rr * 1.6} C ${x + rr} ${y - rr * 0.3}, ${x + rr} ${y + rr}, ${x} ${y + rr} C ${x - rr} ${y + rr}, ${x - rr} ${y - rr * 0.3}, ${x} ${y - rr * 1.6} Z`}
      fill={color}
    />
  )
}

function volumeText(volume) {
  return volume ? <text className="vol-badge">{volume}</text> : null
}

// ---------------------------------------------------------------------------
// action scenes
// ---------------------------------------------------------------------------

function PourAdd({ volume }) {
  const clip = 'beaker-' + useId().replace(/:/g, '')
  const beaker = 'M 96 96 L 100 158 Q 100 166 108 166 L 156 166 Q 164 166 164 158 L 168 96 Z'
  return (
    <svg className="anim pour" viewBox={VB} role="img" aria-label="pour reagent">
      {/* bottle, tilted, top-left */}
      <g transform="rotate(-38 74 52)">
        <rect x="52" y="26" width="44" height="60" rx="10" fill="var(--liquid-2)" opacity="0.85" />
        <rect x="68" y="12" width="14" height="20" rx="3" fill="var(--metal)" />
        <rect x="58" y="40" width="32" height="20" rx="4" fill="#fff" opacity="0.85" />
      </g>
      {/* stream */}
      <g>
        <Drop className="stream s1" cx="112" cy="66" />
        <Drop className="stream s2" cx="112" cy="66" />
        <Drop className="stream s3" cx="112" cy="66" />
      </g>
      {/* beaker with clipped liquid fill */}
      <clipPath id={clip}>
        <path d={beaker} />
      </clipPath>
      <path d={beaker} fill="var(--glass)" opacity="0.3" stroke="var(--glass-edge)" strokeWidth="2.5" />
      <g clipPath={`url(#${clip})`}>
        <rect className="liquid-fill" x="96" y="108" width="72" height="58" fill="var(--liquid)" opacity="0.9" style={{ transformOrigin: 'center bottom' }} />
      </g>
      {volume && <text x="132" y="146" className="vol-badge" textAnchor="middle">{volume}</text>}
    </svg>
  )
}

function PipetteMix({ volume }) {
  return (
    <svg className="anim pipette" viewBox={VB} role="img" aria-label="pipette and mix">
      {/* pipette barrel */}
      <g>
        <rect className="plunger" x="112" y="6" width="16" height="16" rx="3" fill="var(--metal-dark)" />
        <rect x="110" y="20" width="20" height="52" rx="6" fill="var(--metal)" />
        <path d="M 114 72 L 126 72 L 122 104 L 118 104 Z" fill="#fff" opacity="0.9" stroke="var(--glass-edge)" strokeWidth="1.5" />
      </g>
      <Drop className="drop" cx="120" cy="112" />
      <Tube cx={120} top={104} w={44} h={64} level={0.55} animateFill />
      {volume && <text x="120" y="176" className="vol-badge" textAnchor="middle">{volume}</text>}
    </svg>
  )
}

function VortexMix() {
  return (
    <svg className="anim vortex" viewBox={VB} role="img" aria-label="vortex mix">
      <g className="tube-body">
        <Tube cx={120} top={40} w={46} h={104} level={0.5} animateFill />
      </g>
      {/* vortexer base */}
      <rect x="78" y="150" width="84" height="18" rx="6" fill="var(--metal-dark)" />
      <rect x="86" y="146" width="68" height="8" rx="4" fill="var(--metal)" />
    </svg>
  )
}

function Centrifuge({ timer }) {
  const running = timer?.running
  return (
    <svg className={`anim centrifuge${running ? ' fast' : ''}`} viewBox={VB} role="img" aria-label="centrifuge spinning">
      <circle cx="120" cy="84" r="66" fill="var(--glass)" opacity="0.25" />
      <g className="rotor">
        <circle cx="120" cy="84" r="58" fill="none" stroke="var(--metal)" strokeWidth="6" />
        <circle cx="120" cy="84" r="12" fill="var(--metal-dark)" />
        {/* two opposing tube buckets */}
        <g transform="rotate(0 120 84)">
          <rect x="112" y="24" width="16" height="34" rx="6" fill="var(--liquid-2)" />
        </g>
        <g transform="rotate(180 120 84)">
          <rect x="112" y="24" width="16" height="34" rx="6" fill="var(--liquid-2)" />
        </g>
        <g transform="rotate(90 120 84)">
          <rect x="112" y="26" width="14" height="30" rx="6" fill="var(--metal-dark)" opacity="0.7" />
        </g>
        <g transform="rotate(270 120 84)">
          <rect x="112" y="26" width="14" height="30" rx="6" fill="var(--metal-dark)" opacity="0.7" />
        </g>
      </g>
      {timer && (
        <text x="120" y="90" className="ring-num" textAnchor="middle">{formatDuration(timer.remaining)}</text>
      )}
    </svg>
  )
}

function IncubateWait({ timer, temp }) {
  const fraction = timer ? timer.fraction : 1
  return (
    <svg className="anim incubate" viewBox={VB} role="img" aria-label="incubate and wait">
      <CountdownRing fraction={fraction} color="var(--liquid)">
        <text x="120" y="80" className="ring-num" textAnchor="middle">
          {timer ? formatDuration(timer.remaining) : 'wait'}
        </text>
        {temp && <text x="120" y="104" className="ring-sub" textAnchor="middle">{temp}</text>}
      </CountdownRing>
      {/* small thermometer */}
      <g transform="translate(188 44)">
        <rect x="-4" y="0" width="8" height="52" rx="4" fill="var(--glass)" opacity="0.5" stroke="var(--glass-edge)" strokeWidth="2" />
        <circle cx="0" cy="60" r="10" fill="var(--heatB)" />
        <rect className="therm-fluid" x="-2.5" y="24" width="5" height="36" fill="var(--heatB)" />
      </g>
    </svg>
  )
}

function Heat({ timer, temp }) {
  const fraction = timer ? timer.fraction : 1
  return (
    <svg className="anim heat" viewBox={VB} role="img" aria-label="heat / water bath">
      {/* shimmer */}
      <g fill="none" stroke="var(--heatA)" strokeWidth="3" strokeLinecap="round" opacity="0.8">
        <path className="shimmer h1" d="M 96 96 q 6 -8 0 -16 q -6 -8 0 -16" />
        <path className="shimmer h2" d="M 120 96 q 6 -8 0 -16 q -6 -8 0 -16" />
        <path className="shimmer h3" d="M 144 96 q 6 -8 0 -16 q -6 -8 0 -16" />
      </g>
      {/* tube in bath */}
      <Tube cx={120} top={60} w={34} h={70} level={0.5} />
      {/* water bath */}
      <path d="M 72 104 L 76 158 Q 76 166 84 166 L 156 166 Q 164 166 164 158 L 168 104 Z" fill="var(--heatA)" opacity="0.28" stroke="var(--heatB)" strokeWidth="2.5" />
      <rect className="wave" x="74" y="108" width="92" height="10" rx="5" fill="var(--heatA)" opacity="0.6" />
      {temp && <text x="120" y="150" className="temp-badge" textAnchor="middle">{temp}</text>}
      {timer && <text x="120" y="24" className="ring-num sm" textAnchor="middle">{formatDuration(timer.remaining)}</text>}
    </svg>
  )
}

function CoolIce() {
  return (
    <svg className="anim ice" viewBox={VB} role="img" aria-label="keep on ice">
      {/* cold sparkles */}
      <g fill="var(--ice)">
        <circle className="sparkle i1" cx="96" cy="70" r="3" />
        <circle className="sparkle i2" cx="120" cy="62" r="3.5" />
        <circle className="sparkle i3" cx="146" cy="72" r="3" />
      </g>
      <Tube cx={120} top={50} w={38} h={86} level={0.5} />
      {/* ice bed */}
      <g>
        <path d="M 60 128 L 180 128 L 172 168 L 68 168 Z" fill="var(--ice-soft)" stroke="var(--ice)" strokeWidth="2" />
        <g fill="#fff" opacity="0.85" stroke="var(--ice)" strokeWidth="1.5">
          <rect x="74" y="132" width="22" height="20" rx="4" transform="rotate(-8 85 142)" />
          <rect x="104" y="138" width="24" height="22" rx="4" transform="rotate(6 116 149)" />
          <rect x="136" y="132" width="22" height="20" rx="4" transform="rotate(-5 147 142)" />
        </g>
      </g>
    </svg>
  )
}

function Transfer() {
  return (
    <svg className="anim transfer" viewBox={VB} role="img" aria-label="transfer sample">
      {/* source + destination */}
      <g opacity="0.9"><Tube cx={56} top={70} w={34} h={74} level={0.15} /></g>
      <Column cx={186} top={52} />
      {/* arc arrow */}
      <path d="M 66 66 Q 120 8 168 60" fill="none" stroke="var(--liquid-2)" strokeWidth="3" strokeDasharray="4 6" opacity="0.6" />
      {/* moving droplet-tube */}
      <g className="mover" transform="translate(0 0)">
        <g transform="translate(64 60)">
          <ellipse cx="0" cy="0" rx="11" ry="14" fill="var(--liquid)" />
          <ellipse cx="0" cy="-3" rx="6" ry="4" fill="var(--liquid-soft)" opacity="0.8" />
        </g>
      </g>
    </svg>
  )
}

function Wash({ volume }) {
  return (
    <svg className="anim wash" viewBox={VB} role="img" aria-label="wash buffer through column">
      {/* buffer drops entering */}
      <Drop className="drop w1" cx="120" cy="30" />
      <Drop className="drop w2" cx="120" cy="30" />
      <Drop className="drop w3" cx="120" cy="30" />
      <Column cx={120} top={44} />
      {/* flow-through draining below */}
      <g clipPath="none">
        <rect className="liquid-fill" x="100" y="150" width="40" height="16" fill="var(--liquid)" opacity="0.55" />
      </g>
      {volume && <text x="120" y="24" className="vol-badge" textAnchor="middle">{volume}</text>}
    </svg>
  )
}

function Discard() {
  return (
    <svg className="anim discard" viewBox={VB} role="img" aria-label="discard flow-through">
      {/* waste bin */}
      <path d="M 84 120 L 156 120 L 148 168 L 92 168 Z" fill="var(--glass)" opacity="0.3" stroke="var(--glass-edge)" strokeWidth="2.5" />
      <rect x="78" y="112" width="84" height="10" rx="4" fill="var(--metal-dark)" />
      {/* tipping tube */}
      <g className="tipper">
        <g transform="rotate(-42 150 60)"><Tube cx={150} top={20} w={30} h={64} level={0.25} /></g>
      </g>
      <Drop className="waste-drop d1" cx="120" cy="98" color="var(--waste)" />
      <Drop className="waste-drop d2" cx="120" cy="98" color="var(--waste)" />
    </svg>
  )
}

function Elute({ volume }) {
  return (
    <svg className="anim elute" viewBox={VB} role="img" aria-label="elute product">
      <Column cx={120} top={26} />
      {/* single precious drop */}
      <Drop className="drop" cx="120" cy="96" r="6" />
      {/* collection tube filling */}
      <Tube cx={120} top={112} w={40} h={56} level={0.45} animateFill />
      {volume && <text x="120" y="176" className="vol-badge" textAnchor="middle">{volume}</text>}
      <text x="196" y="150" className="ring-sub" textAnchor="middle">RNA</text>
    </svg>
  )
}

function Measure() {
  return (
    <svg className="anim measure" viewBox={VB} role="img" aria-label="measure on instrument">
      {/* instrument body */}
      <rect x="46" y="44" width="148" height="92" rx="12" fill="var(--glass)" opacity="0.35" stroke="var(--glass-edge)" strokeWidth="2.5" />
      <rect x="58" y="56" width="124" height="60" rx="6" fill="#0e1b26" />
      {/* trace */}
      <polyline
        className="trace"
        points="64,104 84,96 96,72 108,100 124,64 140,98 156,84 176,90"
        fill="none"
        stroke="var(--liquid)"
        strokeWidth="3"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <line className="cursor" x1="120" y1="60" x2="120" y2="112" stroke="var(--liquid-soft)" strokeWidth="1.5" opacity="0.7" />
      {/* stand */}
      <rect x="104" y="136" width="32" height="14" fill="var(--metal-dark)" />
      <rect x="86" y="150" width="68" height="10" rx="4" fill="var(--metal)" />
    </svg>
  )
}

function Generic() {
  return (
    <svg className="anim generic" viewBox={VB} role="img" aria-label="step">
      <circle className="halo" cx="120" cy="90" r="46" fill="var(--liquid)" opacity="0.18" />
      <circle cx="120" cy="90" r="26" fill="var(--liquid)" opacity="0.9" />
      <circle cx="120" cy="90" r="26" fill="none" stroke="var(--liquid-2)" strokeWidth="2.5" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// registry — the single source of truth mapping action -> component
// ---------------------------------------------------------------------------

export const ANIMATIONS = {
  pour_add: PourAdd,
  pipette_mix: PipetteMix,
  vortex_mix: VortexMix,
  centrifuge: Centrifuge,
  incubate_wait: IncubateWait,
  heat: Heat,
  cool_ice: CoolIce,
  transfer: Transfer,
  wash: Wash,
  discard: Discard,
  elute: Elute,
  measure: Measure,
  generic: Generic,
}

// Resolve an action name to its component; unknown -> Generic (never crashes).
export function resolveAnimation(action) {
  return ANIMATIONS[action] || ANIMATIONS.generic
}
