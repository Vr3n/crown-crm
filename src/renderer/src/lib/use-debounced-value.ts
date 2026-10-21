import { useEffect, useState } from 'react'

/**
 * Returns `value` once it has been stable for `delayMs`. Used to debounce query
 * inputs (e.g. typing an organization name before running a backend check).
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(id)
  }, [value, delayMs])

  return debounced
}
