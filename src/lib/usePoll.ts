import { useEffect, useRef, useState } from 'react'

/**
 * Runs `fn` now and every `ms` while the tab is visible. Keeps the last good value on errors.
 * Returns [data, error, loading].
 */
export function usePoll<T>(fn: () => Promise<T>, ms: number, deps: unknown[]): [T | undefined, Error | null, boolean] {
  const [data, setData] = useState<T>()
  const [err, setErr] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)
  const fnRef = useRef(fn)
  fnRef.current = fn
  useEffect(() => {
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    setData(undefined)
    setLoading(true)
    const tick = async () => {
      if (document.visibilityState !== 'hidden') {
        try {
          const v = await fnRef.current()
          if (live) { setData(v); setErr(null) }
        } catch (e) {
          if (live) setErr(e instanceof Error ? e : new Error(String(e)))
        } finally {
          if (live) setLoading(false)
        }
      }
      if (live) timer = setTimeout(tick, ms)
    }
    tick()
    const onVis = () => { if (document.visibilityState === 'visible') { clearTimeout(timer); tick() } }
    document.addEventListener('visibilitychange', onVis)
    return () => { live = false; clearTimeout(timer); document.removeEventListener('visibilitychange', onVis) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return [data, err, loading]
}
