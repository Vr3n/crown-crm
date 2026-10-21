import { useCallback, useMemo, useState } from 'react'
import { addDays, endOfDay, startOfDay } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import { CalendarClock } from 'lucide-react'
import { createColumnHelper } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/features/leads/format'
import { EXPIRING_SOON_DAYS, PAGE_SIZE_OPTIONS } from '../constants'
import { daysUntil } from '../format'
import { useUpcomingExpirations } from '../queries'
import type { MembershipExpiration } from '../types'
import { DataTable, type DashboardFeatures } from './data-table'
import { CardPaginationFooter } from './card-pagination-footer'
import { DateRangePicker, type DateRangePreset } from './date-range-picker'
import { ContactCell } from './contact-cell'
import { MemberDetailsSheet } from './member-details-sheet'
import { NameCell } from './name-cell'
import { PlanCell } from './plan-cell'
import { RowActions } from './row-actions'
import { SortButton } from './sort-button'
import { expirationToRenewTarget } from './renew-target'
import { RenewMembershipDialog } from '@/features/memberships/components/renew-membership-dialog'
import type { Membership } from '@/features/customers/types'
import { ExportExcelButton } from '@/features/export/components/export-excel-button'
import type { ExportColumn } from '@/features/export/api'

const EXPORT_COLUMNS: ExportColumn[] = [
  { header: 'Client', key: 'client', format: 'text' },
  { header: 'Phone', key: 'phone', format: 'text' },
  { header: 'Email', key: 'email', format: 'text' },
  { header: 'Expires', key: 'expiresAt', format: 'date' },
  { header: 'Plan', key: 'plan', format: 'text' },
  { header: 'Days Left', key: 'daysLeft', format: 'number' }
]

const helper = createColumnHelper<DashboardFeatures, MembershipExpiration>()

function buildColumns(
  onView: (row: MembershipExpiration) => void,
  onRenew: (row: MembershipExpiration) => void,
  onFollowUp: (row: MembershipExpiration) => void
): ReturnType<typeof helper.columns> {
  return helper.columns([
    helper.accessor((row) => row.member.name, {
      id: 'memberName',
      header: ({ column }) => (
        <SortButton sorted={column.getIsSorted()} onClick={() => column.toggleSorting()}>
          Client
        </SortButton>
      ),
      cell: ({ row }) => (
        <NameCell name={row.original.member.name} personId={row.original.member.personId} />
      ),
      sortFn: 'alphanumeric'
    }),
    helper.accessor((row) => row.member, {
      id: 'contact',
      header: () => 'Contact',
      enableSorting: false,
      cell: ({ row }) => (
        <ContactCell phone={row.original.member.phone} email={row.original.member.email} />
      )
    }),
    helper.accessor('expiresAt', {
      header: ({ column }) => (
        <SortButton sorted={column.getIsSorted()} onClick={() => column.toggleSorting()}>
          Expiration
        </SortButton>
      ),
      cell: ({ row }) => <ExpiryCell expiresAt={row.original.expiresAt} />,
      sortFn: 'datetime'
    }),
    helper.accessor((row) => row, {
      id: 'plan',
      header: () => 'Plan',
      enableSorting: false,
      cell: ({ row }) => (
        <PlanCell plan={row.original.plan} purchasedAt={row.original.purchasedAt} />
      )
    }),
    helper.display({
      id: 'actions',
      header: () => null,
      cell: ({ row }) => (
        <RowActions
          memberName={row.original.member.name}
          onView={() => onView(row.original)}
          onRenew={() => onRenew(row.original)}
          onFollowUp={() => onFollowUp(row.original)}
        />
      )
    })
  ])
}

/** Blocky (0-radius) urgency chip with a simple date line below. */
function ExpiryCell({ expiresAt }: { expiresAt: string }): React.JSX.Element {
  const d = daysUntil(expiresAt)
  const tone = d <= 0 ? 'destructive' : d <= EXPIRING_SOON_DAYS ? 'warning' : 'outline'
  const label =
    d <= 0
      ? `Expired · ${Math.abs(d)}d ago`
      : d <= EXPIRING_SOON_DAYS
        ? `Due in ${d}d`
        : `${d}d left`
  return (
    <div className="flex flex-col items-start gap-1">
      <Badge variant={tone} className="rounded-none px-3 py-1 tabular-nums">
        {label}
      </Badge>
      <span className="text-xs text-muted-foreground">{formatDate(expiresAt)}</span>
    </div>
  )
}

/**
 * Upcoming membership expirations (Module 09 §58) — the renewal follow-up
 * queue. Now a data table: date-range filter + search toolbar, sortable by
 * expiration, client-side pagination, blocky expiry chip, icon-only actions.
 */
export function MembershipExpirationsTable({
  onFollowUp
}: {
  onFollowUp: (row: MembershipExpiration) => void
}): React.JSX.Element {
  const { data, isLoading } = useUpcomingExpirations()
  const [range, setRange] = useState<DateRange>()
  const [member, setMember] = useState<MembershipExpiration | null>(null)
  const [open, setOpen] = useState(false)
  const [renewTarget, setRenewTarget] = useState<Membership | null>(null)

  const handleView = useCallback((row: MembershipExpiration) => {
    setMember(row)
    setOpen(true)
  }, [])

  const handleRenew = useCallback((row: MembershipExpiration) => {
    setRenewTarget(expirationToRenewTarget(row))
  }, [])

  const handleFollowUp = useCallback(
    (selected: MembershipExpiration) => {
      onFollowUp(selected)
    },
    [onFollowUp]
  )

  const columns = useMemo(
    () => buildColumns(handleView, handleRenew, handleFollowUp),
    [handleView, handleRenew, handleFollowUp]
  )

  const presets = useMemo<DateRangePreset[]>(() => {
    const now = new Date()
    return [
      { label: 'Overdue', to: now },
      { label: 'Next 7d', from: now, to: addDays(now, 7) },
      { label: 'Next 30d', from: now, to: addDays(now, 30) },
      { label: 'All' }
    ]
  }, [])

  const filtered = useMemo(() => {
    const rows = data ?? []
    if (!range?.from && !range?.to) return rows
    const from = range.from ? startOfDay(range.from).getTime() : Number.NEGATIVE_INFINITY
    const to = range.to ? endOfDay(range.to).getTime() : Number.POSITIVE_INFINITY
    return rows.filter((r) => {
      const t = new Date(r.expiresAt).getTime()
      return t >= from && t <= to
    })
  }, [data, range])

  const exportData = useMemo(
    () =>
      filtered.map((r) => ({
        client: r.member.name,
        phone: r.member.phone,
        email: r.member.email ?? '',
        expiresAt: r.expiresAt,
        plan: r.plan,
        daysLeft: daysUntil(r.expiresAt)
      })),
    [filtered]
  )

  return (
    <>
      <Card
        data-testid="membership-expirations-table"
        className="crm-gradient-border"
        style={
          {
            '--gradient-start': 'var(--primary)',
            '--gradient-end': 'var(--success)'
          } as React.CSSProperties
        }
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CalendarClock className="size-4" />
            </span>
            <div>
              <span className="font-heading text-base">Membership expirations</span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filtered}
            getRowId={(row) => row.id}
            isLoading={isLoading}
            initialSorting={[{ id: 'expiresAt', desc: false }]}
            initialPageSize={6}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            showPagination={false}
            footer={<CardPaginationFooter />}
            toolbar={
              <>
                <DateRangePicker
                  presets={presets}
                  value={range}
                  onValueChange={setRange}
                  placeholder="Filter by expiry"
                />
                <ExportExcelButton
                  columns={EXPORT_COLUMNS}
                  rows={exportData}
                  sheetName="Membership Expirations"
                />
              </>
            }
            searchPlaceholder="Search members…"
            emptyIcon={CalendarClock}
            emptyTitle="No expirations due"
            emptyDescription="Memberships renewing in this range will appear here."
          />
        </CardContent>
      </Card>
      <MemberDetailsSheet row={member} open={open} onOpenChange={setOpen} />
      {renewTarget ? (
        <RenewMembershipDialog
          membership={renewTarget}
          open={!!renewTarget}
          onOpenChange={(o) => {
            if (!o) setRenewTarget(null)
          }}
        />
      ) : null}
    </>
  )
}
