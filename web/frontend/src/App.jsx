import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import Home from './components/Home.jsx'
import Intake from './components/Intake.jsx'
import BrandWord from './ui/BrandWord.jsx'
import Runner from './components/Runner.jsx'
import { partitionSteps } from './lib/runtime.js'
import { makeRunId, orphanRunKeys } from './lib/runState.js'

// Dev-only harness routes: ?models=1 (model gallery) and ?matrix=1 (animation
// matrix). Lazy so they never touch the production bundle path.
const DevView = lazy(() => import('./dev/DevView.jsx'))
const IS_DEV_ROUTE = (() => {
  const s = new URLSearchParams(window.location.search)
  return s.has('models') || s.has('matrix')
})()

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
// a brand-new run id (Date.now/Math.random injected into the pure minter)
function freshRunId() { return makeRunId(Date.now(), Math.random()) }
// drop every run-scoped localStorage key that isn't the current run — so one run's step,
// passes and log can never bleed into the next (and orphans never pile up).
function pruneOldRuns(currentRunId) {
  try {
    const keys = []
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i))
    orphanRunKeys(keys, currentRunId).forEach((k) => localStorage.removeItem(k))
  } catch { /* private mode */ }
}

export default function App() {
  if (IS_DEV_ROUTE) {
    return (
      <Suspense fallback={null}>
        <DevView />
      </Suspense>
    )
  }
  return <MainApp />
}

function MainApp() {
  const q = new URLSearchParams(window.location.search)
  const persisted = loadSession()

  const [examples, setExamples] = useState([])
  const [protocol, setProtocol] = useState(persisted?.protocol || null)
  const [source, setSource] = useState(persisted?.source || null)
  // the RUN IDENTITY: a resumed session keeps its id (same run); anything else mints a fresh
  // one when a protocol is adopted. Every run-scoped store hangs off this.
  const [runId, setRunId] = useState(() => persisted?.runId || freshRunId())
  const [route, setRoute] = useState('home') // resolved in the mount effect below
  // English-only UI. The original-language + verbatim fields stay in the data (audit
  // trail, untouched) and still show on fallback; restore the EN/Original toggle by
  // making this `useState` again and re-adding the control.
  const lang = 'en'
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
        const id = freshRunId(); pruneOldRuns(id); setRunId(id) // deep-link with no session = a new run
        setProtocol(p); setSource('Neutrophil RNA extraction')
        saveSession({ runId: id, protocol: p, source: 'Neutrophil RNA extraction', lang, answers })
        setRoute(want)
      })
      .catch(() => { window.history.replaceState({}, '', '/'); setRoute('home') })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // keep the session in sync so a reload resumes THIS run (id + answers included)
  useEffect(() => {
    if (protocol) saveSession({ runId, protocol, source, lang, answers })
  }, [runId, protocol, source, answers])

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

  // Adopting a protocol (pick example / upload / paste / re-start the same one) ALWAYS
  // starts a NEW run: a fresh id, empty state, old runs swept. Nothing is inherited.
  const adopt = (p, src) => {
    const id = freshRunId(); pruneOldRuns(id); setRunId(id)
    setProtocol(p); setSource(src); setParseState({ status: 'idle' })
    setAnswers({}) // a fresh protocol starts with fresh intake answers
    saveSession({ runId: id, protocol: p, source: src, lang, answers: {} })
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

  // only actionable steps become 3D stations; the rest show as notes in the intake.
  const { stations, notes } = useMemo(() => partitionSteps(protocol?.steps || []), [protocol])
  const runProtocol = useMemo(() => (protocol ? { ...protocol, steps: stations } : protocol), [protocol, stations])

  let page
  if (route === 'home' || !protocol) {
    page = (
      <div className="app">
        <Home examples={examples} onPickExample={pickExample} onParse={parseUpload} parseState={parseState} />
      </div>
    )
  } else if (route === 'run') {
    page = (
      <Runner
        key={runId}
        runId={runId}
        protocol={runProtocol}
        answers={answers}
        setAnswers={setAnswers}
        initialStep={initialStep}
        onExit={() => go('home')}
      />
    )
  } else {
    page = (
      <div className="app">
        <div className="topbar">
          <button type="button" className="brand brand-btn" onClick={() => go('home')} title="Back to home">
            <BrandWord />
            {source && <small>&nbsp;· {source}</small>}
          </button>
          <span className="spacer" />
        </div>
        <Intake protocol={protocol} notes={notes} answers={answers} setAnswers={setAnswers} onStart={() => go('run')} lang={lang} />
      </div>
    )
  }

  return page
}
