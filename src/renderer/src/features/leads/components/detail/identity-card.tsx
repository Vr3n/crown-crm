import {
  Phone,
  Mail,
  UserRound,
  CalendarDays,
  Tag,
  Target,
  FileText,
  AlertTriangle
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { PersonAvatar } from '@/components/person/person-avatar'
import { can, useSession } from '@/context/session-context'
import { SOURCES, LOST_REASONS } from '../../constants'
import type { LeadQuality } from '../../data-quality'
import { qualityMessage, qualityTier } from '../../data-quality'
import { formatDate } from '../../format'
import type { Lead } from '../../types'
import { StageBadge } from '../stage-badge'

function Row({
  icon: Icon,
  label,
  value
}: {
  icon: typeof Phone
  label: string
  value?: string
}): React.JSX.Element {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate">{value || '—'}</p>
      </div>
    </div>
  )
}

export function IdentityCard({
  lead,
  quality
}: {
  lead: Lead
  quality: LeadQuality
}): React.JSX.Element {
  const tier = qualityTier(quality)
  const session = useSession()
  const canEdit = can(session.permissions, session.isSuper, 'lead.edit')

  return (
    <Card
      className="crm-gradient-border"
      style={
        {
          '--gradient-start': 'var(--primary)',
          '--gradient-end': 'var(--primary)'
        } as React.CSSProperties
      }
    >
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start gap-4">
          <PersonAvatar
            personId={lead.personId}
            name={lead.name}
            size="lg"
            editable={canEdit}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-heading text-xl font-semibold tracking-tight">{lead.name}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <StageBadge stage={lead.stage} isBlacklisted={lead.isBlacklisted} />
                  <Badge variant="outline">{SOURCES[lead.source]}</Badge>
                  {lead.lostReason ? (
                    <Badge variant="destructive">{LOST_REASONS[lead.lostReason]}</Badge>
                  ) : null}
                </div>
              </div>
              {tier !== 'clean' ? (
                <Badge variant={tier === 'bad' ? 'destructive' : 'warning'} className="shrink-0 gap-1">
                  <AlertTriangle className="size-3" />
                  Needs attention
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        {tier !== 'clean' ? (
          <p className="rounded-md border border-dashed border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive">
            {qualityMessage(quality)}
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Row icon={Phone} label="Phone" value={lead.phone} />
          <Row icon={Mail} label="Email" value={lead.email} />
          <Row icon={UserRound} label="Owner" value={lead.owner?.name} />
          <Row icon={CalendarDays} label="Created" value={formatDate(lead.createdAt)} />
          <Row icon={Tag} label="Plan interest" value={lead.planName} />
          <Row icon={Target} label="Goal" value={lead.goal} />
        </div>

        {lead.notes ? (
          <div className="flex items-start gap-2.5 text-sm">
            <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Notes</p>
              <p className="whitespace-pre-wrap">{lead.notes}</p>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
