import { Database, Hash, Globe } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/features/leads/format'
import { ORG_STATUS_META } from '../constants'
import type { OrganizationProfile } from '../types'

/**
 * Tenancy card (Module 14 § 3). The organization is the root of a multi-tenant
 * schema — every business row hangs off `organization_id`. This surfaces the
 * tenant's technical identity (slug, id) and its plan/status, the two things a
 * multi-tenant platform actually cares about.
 */
export function TenancyCard({ org }: { org: OrganizationProfile }): React.JSX.Element {
  const statusMeta = ORG_STATUS_META[org.status]

  return (
    <div
      className="crm-gradient-border flex flex-col gap-4 rounded-lg border border-border bg-card p-5"
      style={
        {
          '--gradient-start': 'var(--violet)',
          '--gradient-end': 'var(--primary)'
        } as React.CSSProperties
      }
    >
      <div className="flex items-center gap-2.5">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Database className="size-4" />
        </span>
        <h2 className="font-heading text-sm font-medium">Tenancy</h2>
        <Badge variant={statusMeta.tone} className="ml-auto">
          {statusMeta.label}
        </Badge>
      </div>

      <div className="flex flex-col divide-y divide-border/60 rounded-lg border border-border bg-background/50">
        <div className="flex items-center justify-between gap-4 px-3 py-2.5">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Globe className="size-3" /> Tenant slug
          </span>
          <span className="truncate font-mono text-sm tabular-nums">{org.slug}</span>
        </div>
        <div className="flex items-center justify-between gap-4 px-3 py-2.5">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Hash className="size-3" /> Organization ID
          </span>
          <span className="font-mono text-sm tabular-nums">#{org.id}</span>
        </div>
        <div className="flex items-center justify-between gap-4 px-3 py-2.5">
          <span className="text-xs text-muted-foreground">Plan</span>
          <span className="font-mono text-sm tabular-nums">{org.planTier ?? '—'}</span>
        </div>
        <div className="flex items-center justify-between gap-4 px-3 py-2.5">
          <span className="text-xs text-muted-foreground">Created</span>
          <span className="font-mono text-sm tabular-nums">{formatDate(org.createdAt)}</span>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Data is scoped per organization — member, plan, invoice and payment rows all carry the{' '}
        <code className="font-mono text-xs">organization_id</code> so one install can serve many
        gyms without them ever seeing each other.
      </p>
    </div>
  )
}
