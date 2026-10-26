import { useEffect, useState } from 'react'
import { getBackend, type LaunchpadBackend } from './launchpad'

export function useBackend(): LaunchpadBackend | null {
  const [b, setB] = useState<LaunchpadBackend | null>(null)
  useEffect(() => { getBackend().then(setB) }, [])
  return b
}

/** Runs an async loader against the backend; returns [data, loading]. */
export function useBackendQuery<T>(fn: (b: LaunchpadBackend) => Promise<T>, deps: unknown[]): [T | undefined, boolean] {
  const backend = useBackend()
  const [data, setData] = useState<T>()
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!backend) return
    let live = true
    setLoading(true)
    fn(backend).then((d) => { if (live) { setData(d); setLoading(false) } }).catch(() => { if (live) setLoading(false) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, ...deps])
  return [data, loading]
}
