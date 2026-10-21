/** Abbreviated day-month year — 16 Aug 2026 */
export const formatDate = (iso: string): string => {
  const date = new Date(iso)
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date)
}

export const formatPercent = (value: number): string => `${value}%`

export const todayIso = (): string => new Date().toISOString().slice(0, 10)
