import type { ReactNode } from 'react'
import { PersonAvatar } from './person-avatar'

/**
 * Reusable table cell that renders a person avatar + name. Used across all
 * person-name tables (leads, customers, memberships, invoices, followups,
 * dashboard cards, finance payments).
 *
 * Photo loading is handled by the batshit batcher under the hood — many
 * `PersonCell` instances rendered simultaneously coalesce into one IPC call.
 */
export function PersonCell({
  personId,
  name,
  subtext
}: {
  personId?: number | string
  name: string
  subtext?: ReactNode
}): React.JSX.Element {
  const numericId = typeof personId === 'string' ? Number(personId) : personId

  return (
    <div className="flex items-center gap-2.5">
      <PersonAvatar personId={numericId} name={name} size="sm" editable={false} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{name}</p>
        {subtext ? <div className="text-xs text-muted-foreground">{subtext}</div> : null}
      </div>
    </div>
  )
}
