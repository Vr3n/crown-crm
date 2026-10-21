import { FileText, PhoneCall, UserRound } from 'lucide-react'
import type { Customer } from '../../types'

/**
 * Account context panel: how the customer arrived (source), who owns the
 * relationship, emergency contact and internal notes.
 */
export function ProfileCard({ customer }: { customer: Customer }): React.JSX.Element {
  const rows: {
    icon: React.ComponentType<{ className?: string }>
    label: string
    value?: string
  }[] = [
    { icon: PhoneCall, label: 'Source', value: customer.source },
    { icon: UserRound, label: 'Emergency contact', value: customer.emergencyContact },
    { icon: UserRound, label: 'Owned by', value: customer.ownerName }
  ]

  return (
    <section className="rounded-lg border bg-card p-5">
      <div className="flex items-center gap-2">
        <FileText className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Account</h3>
      </div>

      <div className="mt-4 flex flex-col gap-2 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start justify-between gap-2">
            <span className="flex items-center gap-2 text-muted-foreground">
              <r.icon className="size-3.5 shrink-0" />
              {r.label}
            </span>
            <span className="min-w-0 text-right font-medium">{r.value ?? '—'}</span>
          </div>
        ))}
      </div>

      {customer.notes ? (
        <div className="mt-4 border-t pt-3">
          <p className="text-xs text-muted-foreground">Notes</p>
          <p className="mt-1 text-sm">{customer.notes}</p>
        </div>
      ) : null}
    </section>
  )
}
