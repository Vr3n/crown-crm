import { Building2, Clock3, FileText, Mail, Phone } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/features/leads/format'
import { ORG_STATUS_META } from '../constants'
import type { OrganizationProfile } from '../types'
import { useOrgLogo } from '../queries'

/**
 * The organization profile card (Module 14 § 1–2). This is the tenant's
 * identity — what the business calls itself, how billing reaches it, and the
 * timezone/currency that every date and money figure in the app is computed in.
 * Editing lives behind `org.manage`.
 */
export function OrgProfileCard({
  org,
  onEdit,
  canEdit = false
}: {
  org: OrganizationProfile
  onEdit: () => void
  canEdit?: boolean
}): React.JSX.Element {
  const statusMeta = ORG_STATUS_META[org.status]
  const { data: logo } = useOrgLogo()

  return (
    <div
      className="crm-gradient-border flex flex-col gap-4 rounded-lg border border-border bg-card p-5"
      style={
        {
          '--gradient-start': 'var(--primary)',
          '--gradient-end': 'var(--primary)'
        } as React.CSSProperties
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-primary/10 text-primary">
            {logo?.src ? (
              <img src={logo.src} alt={`${org.name} logo`} className="size-11 object-cover" />
            ) : (
              <Building2 className="size-5" />
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-lg font-semibold tracking-tight">{org.name}</h2>
              <Badge variant={statusMeta.tone}>{statusMeta.label}</Badge>
            </div>
            {org.legalName ? (
              <p className="truncate text-sm text-muted-foreground">{org.legalName}</p>
            ) : null}
          </div>
        </div>
        {canEdit ? (
          <Button variant="outline" size="sm" onClick={onEdit}>
            Edit
          </Button>
        ) : null}
      </div>

      <div className="grid divide-y divide-border/60 rounded-lg border border-border bg-background/50 px-3 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <div className="flex flex-col gap-0.5 px-1 py-3">
          <span className="flex items-center gap-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">
            <Mail className="size-3" /> Billing email
          </span>
          <span className="truncate font-mono text-sm">{org.billingEmail ?? '—'}</span>
        </div>
        <div className="flex flex-col gap-0.5 px-1 py-3">
          <span className="flex items-center gap-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">
            <Phone className="size-3" /> Mobile
          </span>
          <span className="truncate font-mono text-sm">{org.mobileNumber}</span>
        </div>
        <div className="flex flex-col gap-0.5 px-1 py-3">
          <span className="flex items-center gap-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">
            <Clock3 className="size-3" /> Timezone
          </span>
          <span className="truncate font-mono text-sm">{org.timezone ?? '—'}</span>
        </div>
        <div className="flex flex-col gap-0.5 px-1 py-3">
          <span className="text-[11px] tracking-wide text-muted-foreground uppercase">
            Currency
          </span>
          <span className="truncate font-mono text-sm">{org.currency}</span>
        </div>
      </div>

      {canEdit ? (
        <div className="grid gap-3">
          {(
            [
              ['Invoice terms', org.invoiceTerms],
              ['Receipt terms', org.receiptTerms],
              ['Refund terms', org.refundTerms]
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border bg-background/50 px-3 py-2">
              <span className="flex items-center gap-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">
                <FileText className="size-3" /> {label}
              </span>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {value || 'Not set — printed documents stay clean.'}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Organization since{' '}
        <span className="font-medium text-foreground">{formatDate(org.createdAt)}</span>
      </p>
    </div>
  )
}
