import { FileText, Mail, MapPin, Phone, PhoneCall, UserRound } from 'lucide-react'
import { PersonAvatar } from '@/components/person/person-avatar'
import { can, useSession } from '@/context/session-context'
import { displayPhone, formatDate } from '@/features/leads/format'
import { formatMonthYear } from '../../format'
import type { Customer } from '../../types'
import { CustomerStatusBadge } from '../status-badge'

/**
 * Customer identity — the stable person at the top of the 360 view. Contact
 * details here are current-record values; historical invoices keep their own
 * snapshots (docs/02 §21). Profile context (source, owner, emergency contact)
 * is inlined here so the bento grid has one strong anchor cell instead of two
 * smaller split tiles.
 *
 * Icons are subtly tinted per field for quick visual scanning.
 */
export function IdentityCard({
  customer,
  status
}: {
  customer: Customer
  status: Parameters<typeof CustomerStatusBadge>[0]['status']
}): React.JSX.Element {
  const session = useSession()
  const canEdit = can(session.permissions, session.isSuper, 'lead.edit')

  return (
    <section
      className="crm-gradient-border flex flex-col rounded-xl border bg-card p-5 shadow-sm"
      style={
        {
          '--gradient-start': 'var(--primary)',
          '--gradient-end': 'var(--primary)'
        } as React.CSSProperties
      }
    >
      <div className="flex items-start gap-4">
        <PersonAvatar
          personId={customer.personId ? Number(customer.personId) : undefined}
          name={customer.name}
          size="lg"
          editable={canEdit}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="truncate font-heading text-lg font-semibold tracking-tight">
              {customer.name}
            </h2>
            <CustomerStatusBadge status={status} />
          </div>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground tabular-nums">
            {customer.id} · member since {formatMonthYear(customer.joinedAt)}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <Phone className="size-3.5 shrink-0 text-blue-500 dark:text-blue-400" />
          <span className="tabular-nums text-muted-foreground">{displayPhone(customer.phone)}</span>
        </div>
        <div className="flex min-w-0 items-center gap-2.5">
          <Mail className="size-3.5 shrink-0 text-emerald-500 dark:text-emerald-400" />
          <span className="truncate text-muted-foreground">{customer.email ?? '—'}</span>
        </div>
        <div className="flex min-w-0 items-center gap-2.5">
          <UserRound className="size-3.5 shrink-0 text-amber-500 dark:text-amber-400" />
          <span className="text-muted-foreground">
            {customer.gender ?? '—'} · {formatDate(customer.dateOfBirth ?? customer.createdAt)}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-2.5">
          <MapPin className="size-3.5 shrink-0 text-rose-500 dark:text-rose-400" />
          <span className="truncate text-muted-foreground">{customer.address ?? '—'}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2.5 border-t pt-4 text-sm sm:grid-cols-2">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-muted-foreground">
            <PhoneCall className="size-3.5 shrink-0 text-violet-500 dark:text-violet-400" />
            Source
          </span>
          <span className="min-w-0 text-right font-medium">{customer.source ?? '—'}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-muted-foreground">
            <UserRound className="size-3.5 shrink-0 text-sky-500 dark:text-sky-400" />
            Owned by
          </span>
          <span className="min-w-0 text-right font-medium">{customer.ownerName ?? '—'}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-muted-foreground">
            <UserRound className="size-3.5 shrink-0 text-orange-500 dark:text-orange-400" />
            Emergency
          </span>
          <span className="min-w-0 text-right font-medium">{customer.emergencyContact ?? '—'}</span>
        </div>
      </div>

      {customer.notes ? (
        <div className="mt-4 flex items-start gap-2.5 border-t pt-4 text-sm">
          <FileText className="mt-0.5 size-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Notes</p>
            <p className="mt-0.5 whitespace-pre-wrap">{customer.notes}</p>
          </div>
        </div>
      ) : null}
    </section>
  )
}
