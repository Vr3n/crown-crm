import type { ReactNode } from 'react'
import { PersonCell } from '@/components/person/person-cell'

/**
 * Bold client name cell with optional avatar. Names are the primary identifier
 * in a row, so they get the strongest weight (per the table UI guide: bold
 * important records). `subtext` renders a context line under the name (e.g. a
 * stage badge).
 */
export function NameCell({
  name,
  personId,
  subtext
}: {
  name: string
  personId?: number | string
  subtext?: ReactNode
}): React.JSX.Element {
  if (personId) {
    return <PersonCell personId={personId} name={name} subtext={subtext} />
  }
  return (
    <span className="inline-flex min-w-0 flex-col items-start gap-0.5">
      <span className="text-sm font-semibold">{name}</span>
      {subtext}
    </span>
  )
}
