import { useCallback, useEffect, useRef, useState } from 'react'

// Browser speech-to-text (Web Speech API). It ONLY produces a transcript — it decides
// nothing (that's voiceIntent/voiceDispatch). The mic is OFF until start() is called and
// exposes an honest `listening` flag; nothing is ever hot by default.
//
// Graceful degradation: on a browser without the API (Firefox, some Safari) `supported`
// is false and start() is a no-op, so the caller can show the affordance as unavailable
// rather than broken.
export function useVoice({ onFinal, onInterim } = {}) {
  const Rec = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
  const supported = !!Rec

  const [listening, setListening] = useState(false)
  const [error, setError] = useState(null)
  const [interim, setInterim] = useState('')

  const recRef = useRef(null)
  const enabledRef = useRef(false)     // the user's intent — survives the API's auto-stops
  const finalRef = useRef(onFinal)
  const interimCbRef = useRef(onInterim)
  finalRef.current = onFinal
  interimCbRef.current = onInterim

  useEffect(() => {
    if (!supported) return undefined
    const rec = new Rec()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-US'

    rec.onresult = (e) => {
      let live = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        const txt = r[0].transcript
        if (r.isFinal) {
          setInterim('')
          finalRef.current?.(txt.trim())
        } else {
          live += txt
        }
      }
      if (live) { setInterim(live); interimCbRef.current?.(live) }
    }

    rec.onerror = (e) => {
      // permission / device denial is terminal for this session; transient blips are not.
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        enabledRef.current = false
        setError('mic-denied')
        setListening(false)
      } else if (e.error === 'audio-capture') {
        enabledRef.current = false
        setError('no-mic')
        setListening(false)
      }
      // 'no-speech' / 'aborted' are benign — onend will restart if still enabled.
    }

    rec.onend = () => {
      // the API stops itself periodically; if the user still wants it on, restart.
      if (enabledRef.current) { try { rec.start() } catch { /* already starting */ } }
      else setListening(false)
    }

    recRef.current = rec
    return () => { enabledRef.current = false; try { rec.abort() } catch { /* ignore */ } }
  }, [supported]) // eslint-disable-line react-hooks/exhaustive-deps

  const start = useCallback(() => {
    if (!supported || enabledRef.current) return
    enabledRef.current = true
    setError(null)
    try { recRef.current.start(); setListening(true) } catch { /* start races onend */ }
  }, [supported])

  const stop = useCallback(() => {
    enabledRef.current = false
    setInterim('')
    try { recRef.current?.stop() } catch { /* ignore */ }
    setListening(false)
  }, [])

  const toggle = useCallback(() => { (enabledRef.current ? stop : start)() }, [start, stop])

  return { supported, listening, error, interim, start, stop, toggle }
}
