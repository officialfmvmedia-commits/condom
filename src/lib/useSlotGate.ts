import { useEffect, useState } from 'react'
import { useConnection } from '@solana/wallet-adapter-react'
import { RULES } from './rules'

/**
 * Tracks how many slots remain before the dev buy unlocks for a coin created at `creationSlot`.
 * Returns null until a creation slot is known. Polls the RPC; the backend re-checks the gap anyway.
 */
export function useSlotGate(creationSlot: number | null): { slotsLeft: number | null; unlocked: boolean } {
  const { connection } = useConnection()
  const [current, setCurrent] = useState<number | null>(null)
  useEffect(() => {
    if (creationSlot == null) return
    let live = true
    const tick = async () => {
      try { const s = await connection.getSlot('confirmed'); if (live) setCurrent(s) } catch { /* retry next tick */ }
    }
    tick()
    const id = setInterval(tick, RULES.APPROX_SLOT_MS)
    return () => { live = false; clearInterval(id) }
  }, [connection, creationSlot])
  if (creationSlot == null || current == null) return { slotsLeft: null, unlocked: false }
  const left = Math.max(0, creationSlot + RULES.DEV_BUY_MIN_SLOTS_AFTER_CREATE - current)
  return { slotsLeft: left, unlocked: left === 0 }
}
