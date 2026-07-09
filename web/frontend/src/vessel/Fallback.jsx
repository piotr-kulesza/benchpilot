// Static, GPU-free vessel — shown while the 3D scene loads and whenever WebGL
// is unavailable. Tasteful, never blank, never crashes. Uses the same palette.

import { theme } from './theme.js'

export default function Fallback({ liquidColor = theme.liquid.accent, fill = 0.5 }) {
  const top = 150 - fill * 150 // liquid surface within the 0..150 body
  return (
    <svg className="vessel-fallback" viewBox="0 0 200 240" role="img" aria-label="vessel">
      <defs>
        <linearGradient id="vf-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="0.5" stopColor="#dfe8ea" stopOpacity="0.5" />
          <stop offset="1" stopColor="#c9d5d8" stopOpacity="0.7" />
        </linearGradient>
        <clipPath id="vf-clip">
          <path d="M70 24 h60 v96 a30 40 0 0 1 -12 30 v20 a18 18 0 0 1 -36 0 v-20 a30 40 0 0 1 -12 -30 Z" />
        </clipPath>
      </defs>
      <ellipse cx="100" cy="228" rx="52" ry="9" fill="#22423d" opacity="0.16" />
      <g clipPath="url(#vf-clip)">
        <rect x="60" y={24 + top * 0.62} width="80" height="200" fill={liquidColor} opacity="0.9" />
        <rect x="60" y={24 + top * 0.62} width="80" height="6" fill="#ffffff" opacity="0.35" />
      </g>
      <path
        d="M70 24 h60 v96 a30 40 0 0 1 -12 30 v20 a18 18 0 0 1 -36 0 v-20 a30 40 0 0 1 -12 -30 Z"
        fill="url(#vf-glass)"
        stroke="#b6c4c7"
        strokeWidth="2.5"
      />
      <ellipse cx="88" cy="60" rx="6" ry="30" fill="#ffffff" opacity="0.5" />
    </svg>
  )
}
