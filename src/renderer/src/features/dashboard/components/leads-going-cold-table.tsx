import { useMemo, useState } from 'react'
import { Flame } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/empty-state'
import { PersonCell } from '@/components/person/person-cell'
import { timeAgo } from '@/features/leads/format'
import { useLeads } from '@/features/leads/queries'
import type { Lead } from '@/features/leads/types'
import { COLD_LEAD_DAYS, MAX_ROWS } from '../constants'
import { daysSince } from '../format'
import { ExportExcelButton } from '@/features/export/components/export-excel-button'
import type { ExportColumn } from '@/features/export/api'
import { SOURCES } from '@/features/leads/constants'

const COLD_LEAD_EXPORT_COLUMNS: ExportColumn[] = [
  { header: 'Name', key: 'name', format: 'text' },
  { header: 'Phone', key: 'phone', format: 'text' },
  { header: 'Email', key: 'email', format: 'text' },
  { header: 'Stage', key: 'stage', format: 'text' },
  { header: 'Source', key: 'source', format: 'text' },
  { header: 'Owner', key: 'owner', format: 'text' },
  { header: 'Days Silent', key: 'daysSilent', format: 'number' },
  { header: 'Last Touched', key: 'lastTouchedAt', format: 'datetime' }
]

const HEAD = 'px-0 py-2.5 text-left text-xs font-medium text-muted-foreground'
const CELL = 'px-0 py-2.5 align-middle'

/** Last moment the lead had any follow-up or activity; createdAt if never touched. */
function lastTouchedAt(lead: Lead): string {
  const stamps = lead.activities
    .map((a) => a.at)
    .concat(
      lead.followUps.flatMap((f) => [f.dueAt, f.completedAt].filter((v): v is string => Boolean(v)))
    )
  return stamps.length ? stamps.reduce((m, s) => (s > m ? s : m)) : lead.createdAt
}

/**
 * Leads turning cold — non-terminal leads with no follow-up or activity for a
 * while (Module 09 §58). Longest silence first so the most at-risk leads
 * surface at the top. Lost (and won) leads are excluded.
 */
export function LeadsGoingColdTable(): React.JSX.Element {
  const { data, isLoading } = useLeads()

  const rows = useMemo(() => {
    if (!data) return []
    return data
      .filter((l) => l.stage !== 'LOST' && l.stage !== 'WON')
      .map((l) => ({ lead: l, since: daysSince(lastTouchedAt(l)) }))
      .filter(({ since }) => since >= COLD_LEAD_DAYS)
      .sort((a, b) => b.since - a.since)
      .slice(0, MAX_ROWS)
  }, [data])

  const [selected, setSelected] = useState<Set<number>>(() => new Set())

  const coldLeadExportData = useMemo(
    () =>
      rows.map(({ lead, since }) => ({
        name: lead.name,
        phone: lead.phone ?? '',
        email: lead.email ?? '',
        stage: lead.stage,
        source: SOURCES[lead.source] ?? lead.source,
        owner: lead.owner?.name ?? 'Unassigned',
        daysSilent: since,
        lastTouchedAt: lastTouchedAt(lead)
      })),
    [rows]
  )

  const toggleRow = (id: number): void =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleAll = (value: boolean): void =>
    setSelected(value ? new Set(rows.map((r) => r.lead.id)) : new Set())
  return (
    <Card
      className="crm-gradient-border"
      style={
        {
          '--gradient-start': 'var(--warning)',
          '--gradient-end': 'var(--primary)'
        } as React.CSSProperties
      }
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-lg bg-warning/10 text-warning">
            <Flame className="size-4" />
          </span>
          <div className="flex flex-1 items-center justify-between">
            <div>
              <span className="font-heading text-base">Leads turning cold</span>
            </div>
            <div className="flex items-center gap-2">
              {rows.length > 0 && (
                <span className="hidden items-center gap-1.5 rounded-full bg-warning/10 px-3 py-1 text-xs font-medium text-warning sm:flex">
                  <Flame className="size-3" />
                  {rows.length} lead{rows.length !== 1 ? 's' : ''} need attention
                </span>
              )}
              <ExportExcelButton
                columns={COLD_LEAD_EXPORT_COLUMNS}
                rows={coldLeadExportData}
                sheetName="Leads Going Cold"
              />
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Flame}
            title="Nothing going cold"
            description={`Leads with no follow-up or activity for ${COLD_LEAD_DAYS}+ days will appear here.`}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted border-b border-border hover:bg-transparent">
                <TableHead className={`${HEAD} w-10 pr-3`}>
                  <Checkbox
                    checked={
                      rows.length > 0 && selected.size === rows.length
                        ? true
                        : selected.size > 0
                          ? 'indeterminate'
                          : false
                    }
                    onCheckedChange={(value) => toggleAll(Boolean(value))}
                    aria-label="Select all leads"
                  />
                </TableHead>
                <TableHead className={HEAD}>Lead</TableHead>
                <TableHead className={HEAD}>Contact</TableHead>
                <TableHead className={`${HEAD} text-right`}>Last follow-up / activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ lead, since }) => (
                <TableRow
                  key={lead.id}
                  data-state={selected.has(lead.id) ? 'selected' : undefined}
                  className="group even:bg-muted/40 hover:bg-muted/60 transition-colors data-[state=selected]:!bg-primary/5"
                >
                  <TableCell className={`${CELL} w-10 pr-3`}>
                    <Checkbox
                      checked={selected.has(lead.id)}
                      onCheckedChange={() => toggleRow(lead.id)}
                      aria-label={`Select ${lead.name}`}
                      className="group-hover:border-muted-foreground/60"
                    />
                  </TableCell>
                  <TableCell className={CELL}>
                    <PersonCell
                      personId={lead.personId}
                      name={lead.name}
                      subtext={
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
                          {since}d silent
                        </span>
                      }
                    />
                  </TableCell>
                  <TableCell className={`${CELL} text-muted-foreground`}>
                    {lead.phone?.trim() || lead.email?.trim() || '—'}
                  </TableCell>
                  <TableCell className={`${CELL} text-right text-muted-foreground`}>
                    {timeAgo(lastTouchedAt(lead))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
