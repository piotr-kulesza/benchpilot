// Design-system primitives. Every screen is built from these — no bespoke chrome.
// Rules baked in: a Badge/Chip with no content does NOT render; protocol text is
// never truncated; every interactive element inherits hover/focus/active/disabled.
import { forwardRef } from 'react'

const cx = (...a) => a.filter(Boolean).join(' ')
const has = (v) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0)

export function Button({ variant = 'secondary', size, block, className, type = 'button', children, ...rest }) {
  return (
    <button
      type={type}
      className={cx('btn', `btn-${variant}`, size && `btn-${size}`, block && 'btn-block', className)}
      {...rest}
    >
      {children}
    </button>
  )
}

// A badge with no children renders NOTHING (no blank pills, ever).
export function Badge({ tone, dot, children, className, ...rest }) {
  if (!has(children)) return null
  return (
    <span className={cx('badge', className)} data-tone={tone} {...rest}>
      {dot && <span className="badge-dot" />}
      {children}
    </span>
  )
}

// key · value chip. Renders only if it has a key or value.
export function Chip({ k, v, tone, num, className, ...rest }) {
  if (!has(k) && !has(v)) return null
  return (
    <span className={cx('chip', className)} data-tone={tone} {...rest}>
      {has(k) && <span className="chip-k">{k}</span>}
      {has(v) && <span className={cx('chip-v', num && 'num')}>{v}</span>}
    </span>
  )
}

export function Card({ as: As = 'div', className, ...rest }) {
  return <As className={cx('card', As === 'button' && 'card-btn', className)} {...rest} />
}

export function Panel({ title, sub, actions, children, className, ...rest }) {
  return (
    <section className={cx('panel', className)} {...rest}>
      {(has(title) || has(actions)) && (
        <div className="panel-head">
          {has(title) && <h2 className="panel-title">{title}</h2>}
          {actions}
        </div>
      )}
      {has(sub) && <p className="panel-sub">{sub}</p>}
      {children}
    </section>
  )
}

export const Input = forwardRef(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx('input', className)} {...rest} />
})

export const Textarea = forwardRef(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx('textarea', className)} {...rest} />
})

export function Progress({ value = 0, label }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <i style={{ width: `${pct}%` }} />
    </div>
  )
}

const ALERT_ICON = { hazard: '⛔', warn: '⚠', info: 'ℹ' }
export function Alert({ tone = 'info', icon, critical, children, className, ...rest }) {
  if (!has(children)) return null
  return (
    <div className={cx('alert', critical && 'critical', className)} data-tone={tone} role={tone === 'hazard' ? 'alert' : undefined} {...rest}>
      <span className="alert-icon" aria-hidden="true">{icon || ALERT_ICON[tone]}</span>
      <span className="alert-body">{children}</span>
    </div>
  )
}

// Numbers that change read as instrument readouts (mono + tabular figures).
export function Num({ children, className, ...rest }) {
  return <span className={cx('num', className)} {...rest}>{children}</span>
}

export function Segmented({ options, value, onChange, ariaLabel }) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
