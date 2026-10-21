import { useEffect, useState } from 'react'

/**
 * Render-pure "now": state ticked by an interval, so no impure call during
 * render (react-hooks/purity). Pass the value down to pure derivation functions
 * instead of calling Date.now() in the render path.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}
