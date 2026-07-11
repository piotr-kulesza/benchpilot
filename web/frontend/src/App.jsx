import { useEffect, useMemo, useRef, useState } from 'react'
import Home from './components/Home.jsx'
import Intake from './components/Intake.jsx'
import Runner from './components/Runner.jsx'
import { partitionSteps } from './lib/runtime.js'

// Live-parse backend (uploads / paste). Empty = no backend → the bundled examples
// still work with ZERO backend and no API key. Point at web/api.py with VITE_API_BASE.
const API_BASE = import.meta.env.VITE_API_BASE || ''
const STORE_KEY = 'benchpilot.session'

// ── tiny path router: '/', '/intake', '/run'. The legacy ?run=1[&step=N] deep link
// still means "jump into the runner" (of the current / default protocol). ──
function routeFromLocation() {
  const q = new URLSearchParams(window.location.search)
  if (q.get('run')) return 'run'
  const p = window.location.pathname
  return p === '/run' ? 'run' : p === '/intake' ? 'intake' : 'home'
}
function urlAnswers() {
  const q = new URLSearchParams(window.location.search)
  const a = {}
  for (const k of ['kit', 'cells', 'analysis', 'rin']) if (q.get(k)) a[k] = q.get(k)
  return a
}

function loadSession() {
  try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null') } catch { return null }
}
function saveSession(s) {
  try { sessionStorage.setItem(STORE_KEY, JSON.stringify(s)) } catch { /* private mode */ }
}

export default function App() {
  const q = new URLSearchParams(window.location.search)
  const persisted = loadSession()

  const [examples, setExamples] = useState([])
  const [protocol, setProtocol] = useState(persisted?.protocol || null)
  const [source, setSource] = useState(persisted?.source || null)
  const [route, setRoute] = useState('home') // resolved in the mount effect below
  const [lang, setLang] = useState(q.get('lang') === 'orig' ? 'orig' : (persisted?.lang || 'en'))
  const [answers, setAnswers] = useState({ ...(persisted?.answers || {}), ...urlAnswers() })
  const [parseState, setParseState] = useState({ status: 'idle' })
  const initialStep = q.get('step') ? Math.max(0, parseInt(q.get('step'), 10) - 1) : 0
  const resolved = useRef(false)

  // load the example index (home needs it; harmless elsewhere)
  useEffect(() => {
    fetch('protocols/index.json').then((r) => (r.ok ? r.json() : [])).then(setExamples).catch(() => setExamples([]))
  }, [])

  // resolve the initial route once (handles reload-mid-run + legacy deep links)
  useEffect(() => {
    if (resolved.current) return
    resolved.current = true
    const want = routeFromLocation()
    if (want === 'home') { setRoute('home'); return }
    if (protocol) { setRoute(want); return } // persisted session → stay where we were
    // a /run or /intake (or ?run=1) with no protocol: default to the RNA example so
    // existing deep links keep working; otherwise fall back Home.
    fetch('protocols/neutrophil_rna.json')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((p) => {
        setProtocol(p); setSource('Neutrophil RNA extraction')
        saveSession({ protocol: p, source: 'Neutrophil RNA extraction', lang, answers })
        setRoute(want)
      })
      .catch(() => { window.history.replaceState({}, '', '/'); setRoute('home') })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // back/forward
  useEffect(() => {
    const onPop = () => setRoute(routeFromLocation())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const go = (r, { replace } = {}) => {
    const path = r === 'home' ? '/' : '/' + r
    window.history[replace ? 'replaceState' : 'pushState']({}, '', path)
    setRoute(r)
  }

  const adopt = (p, src) => {
    setProtocol(p); setSource(src); setParseState({ status: 'idle' })
    setAnswers({}) // a fresh protocol starts with fresh intake answers
    saveSession({ protocol: p, source: src, lang, answers: {} })
    go('intake')
  }

  const pickExample = (ex) => {
    setParseState({ status: 'loading' })
    fetch('protocols/' + ex.file)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Could not load ${ex.name} (${r.status})`))))
      .then((p) => adopt(p, ex.name))
      .catch((e) => setParseState({ status: 'error', message: e.message }))
  }

  const parseUpload = ({ text, file }) => {
    setParseState({ status: 'loading' })
    const done = (p) => adopt(p, file ? file.name : 'Pasted protocol')
    const fail = (msg) => setParseState({ status: 'error', message: msg })
    const req = file
      ? (() => { const fd = new FormData(); fd.append('file', file); return fetch(`${API_BASE}/api/parse-file`, { method: 'POST', body: fd }) })()
      : fetch(`${API_BASE}/api/parse`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
    req
      .then(async (r) => {
        // 404/405 on the parse endpoint = no backend wired (same-origin static host).
        if (r.status === 404 || r.status === 405) throw new Error('__no_backend__')
        if (!r.ok) {
          let detail = `Parse failed (${r.status}).`
          try { const j = await r.json(); if (j.detail) detail = j.detail } catch { /* non-JSON */ }
          throw new Error(detail)
        }
        return r.json()
      })
      .then(done)
      .catch((e) => fail(
        e.message === '__no_backend__' || /Failed to fetch|NetworkError/i.test(e.message)
          ? 'Live parsing needs the backend running (web/api.py) with an ANTHROPIC_API_KEY. It looks offline.'
          : e.message,
      ))
  }

  // keep lang persisted across reloads
  useEffect(() => { if (protocol) saveSession({ protocol, source, lang, answers }) }, [lang]) // eslint-disable-line react-hooks/exhaustive-deps

  // only actionable steps become 3D stations; the rest show as notes in the intake.
  const { stations, notes } = useMemo(() => partitionSteps(protocol?.steps || []), [protocol])
  const runProtocol = useMemo(() => (protocol ? { ...protocol, steps: stations } : protocol), [protocol, stations])

  if (route === 'home' || !protocol) {
    return (
      <div className="app">
        <div className="shell">
          <Home examples={examples} onPickExample={pickExample} onParse={parseUpload} parseState={parseState} />
        </div>
      </div>
    )
  }

  if (route === 'run') {
    return (
      <Runner
        protocol={runProtocol}
        answers={answers}
        setAnswers={setAnswers}
        initialStep={initialStep}
        onExit={() => go('intake')}
        lang={lang}
        setLang={setLang}
      />
    )
  }

  // intake
  return (
    <div className="app">
      <div className="shell">
        <div className="masthead">
          <button className="ghost-btn home-back" onClick={() => go('home')}>← Home</button>
          <div className="brand">
            <span className="dot" />
            benchpilot
            {source && <small>&nbsp;· {source}</small>}
          </div>
          <span className="spacer" />
          <LangToggle lang={lang} setLang={setLang} />
        </div>

        <Intake
          protocol={protocol}
          notes={notes}
          answers={answers}
          setAnswers={setAnswers}
          onStart={() => go('run')}
          lang={lang}
        />
      </div>
    </div>
  )
}

function LangToggle({ lang, setLang }) {
  return (
    <div className="lang-toggle" role="group" aria-label="language">
      <button aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
      <button aria-pressed={lang === 'orig'} onClick={() => setLang('orig')}>Original</button>
    </div>
  )
}
