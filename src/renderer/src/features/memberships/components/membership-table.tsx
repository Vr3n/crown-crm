import { useMemo } from 'react'
import { CreditCard, Snowflake, Ban, ShieldCheck } from 'lucide-react'
import { createColumnHelper } from '@tanstack/react-table'
import { PersonCell } from '@/components/person/person-cell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DataTable, type DashboardFeatures } from '@/features/dashboard/components/data-table'
import { SortButton } from '@/features/dashboard/components/sort-button'
import { EXPIRING_SOON_DAYS } from '@/features/customers/constants'
import { daysUntil, formatShortDate } from '@/features/customers/format'
import { formatMinor } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import { cn } from '@/lib/utils'
import type { MembershipRow } from '../types'
import { MembershipStatusBadge } from '@/features/customers/components/status-badge'
import { ExportExcelButton } from '@/features/export/components/export-excel-button'
import type { ExportColumn } from '@/features/export/api'
import type { CurrencyCode } from '@/lib/money'

const EXPORT_COLUMNS: ExportColumn[] = [
  { header: 'Member', key: 'customerName', format: 'text' },
  { header: 'Plan', key: 'plan', format: 'text' },
  { header: 'Status', key: 'status', format: 'text' },
  { header: 'Start', key: 'startDate', format: 'date' },
  { header: 'End', key: 'endDate', format: 'date' },
  { header: 'Amount', key: 'priceMinor', format: 'money' },
  { header: 'Discount', key: 'discountMinor', format: 'money' },
  { header: 'Freezes', key: 'freezeCount', format: 'number' },
  { header: 'Days Left', key: 'daysLeft', format: 'number' }
]

const helper = createColumnHelper<DashboardFeatures, MembershipRow>()

function DaysLeftCell({ row, now }: { row: MembershipRow; now: number }): React.JSX.Element {
  if (row.status !== 'ACTIVE' && row.status !== 'FROZEN' && row.status !== 'PENDING') {
    return <span className="text-sm text-muted-foreground">—</span>
  }
  const days = daysUntil(row.endDate, now)
  return (
    <span
      className={cn(
        'font-mono text-xs font-medium tabular-nums',
        row.status === 'ACTIVE' && days <= EXPIRING_SOON_DAYS && 'text-warning',
        row.status === 'ACTIVE' && days > EXPIRING_SOON_DAYS && 'text-foreground',
        row.status !== 'ACTIVE' && 'text-primary'
      )}
    >
      {days}d
    </span>
  )
}

function buildColumns(
  now: number,
  currency: CurrencyCode,
  canBlacklist: boolean,
  onBlacklist: (row: MembershipRow) => void
): ReturnType<typeof helper.columns> {
  return helper.columns([
    helper.accessor((row) => row.customerName, {
      id: 'customerName',
      header: ({ column }) => (
        <SortButton
          className="text-primary"
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
        >
          Member
        </SortButton>
      ),
      cell: ({ row }) => (
        <PersonCell
          personId={row.original.personId}
          name={row.original.customerName}
          subtext={
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {row.original.id} · {row.original.customerId}
              </span>
              {row.original.isBlacklisted ? (
                <Badge variant="destructive" className="gap-1 px-1.5 py-0 text-[10px]">
                  <Ban className="size-2.5" />
                  Blacklisted
                </Badge>
              ) : null}
            </div>
          }
        />
      ),
      sortFn: 'alphanumeric'
    }),
    helper.accessor((row) => row.plan, {
      id: 'plan',
      header: ({ column }) => (
        <SortButton
          className="text-primary"
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
        >
          Plan
        </SortButton>
      ),
      cell: ({ row }) => <span className="text-sm font-medium">{row.original.plan}</span>,
      sortFn: 'alphanumeric'
    }),
    helper.accessor((row) => row.status, {
      id: 'status',
      header: () => 'Status',
      enableSorting: false,
      cell: ({ row }) => <MembershipStatusBadge status={row.original.status} />
    }),
    helper.accessor((row) => row.startDate, {
      id: 'period',
      header: ({ column }) => (
        <SortButton
          className="text-primary"
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
        >
          Period
        </SortButton>
      ),
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {formatShortDate(row.original.startDate)} → {formatShortDate(row.original.endDate)}
        </span>
      ),
      sortFn: 'datetime'
    }),
    helper.accessor((row) => row.priceMinor, {
      id: 'amount',
      header: () => 'Amount',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-mono text-sm font-medium tabular-nums">
            {formatMinor(row.original.priceMinor - row.original.discountMinor, currency)}
          </span>
          <span className="text-xs text-muted-foreground">
            {row.original.billingFrequency.charAt(0) +
              row.original.billingFrequency.slice(1).toLowerCase()}
          </span>
        </div>
      )
    }),
    helper.accessor((row) => row.freezeCount, {
      id: 'freezes',
      header: () => 'Freezes',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.freezeCount > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
            <Snowflake className="size-3" />
            {row.original.freezeCount}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )
    }),
    helper.accessor((row) => row.endDate, {
      id: 'daysLeft',
      header: () => 'Left',
      enableSorting: false,
      cell: ({ row }) => <DaysLeftCell row={row.original} now={now} />
    }),
    ...(canBlacklist
      ? [
          helper.display({
            id: 'actions',
            header: () => null,
            cell: ({ row }) => {
              const m = row.original
              return (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={
                        m.isBlacklisted
                          ? `Lift blacklist for ${m.customerName}`
                          : `Blacklist ${m.customerName}`
                      }
                      onClick={(e) => {
                        e.stopPropagation()
                        onBlacklist(m)
                      }}
                      className={
                        m.isBlacklisted
                          ? 'text-primary hover:text-primary'
                          : 'text-muted-foreground hover:text-destructive'
                      }
                    >
                      {m.isBlacklisted ? (
                        <ShieldCheck className="size-4" />
                      ) : (
                        <Ban className="size-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    {m.isBlacklisted ? 'Lift blacklist' : 'Blacklist'}
                  </TooltipContent>
                </Tooltip>
              )
            }
          })
        ]
      : [])
  ])
}

/**
 * The memberships list — every entitlement period across customers, defaulting
 * to open memberships soonest-to-expire. Row-click opens the customer 360 view.
 */
export function MembershipTable({
  rows,
  now,
  isLoading,
  onOpenCustomer,
  onBlacklist,
  canBlacklist
}: {
  rows: MembershipRow[]
  now: number
  isLoading: boolean
  onOpenCustomer: (customerId: string) => void
  onBlacklist: (row: MembershipRow) => void
  canBlacklist: boolean
}): React.JSX.Element {
  const currency = useCurrency()
  const columns = useMemo(
    () => buildColumns(now, currency, canBlacklist, onBlacklist),
    [now, currency, canBlacklist, onBlacklist]
  )

  const exportData = useMemo(
    () =>
      rows.map((r) => ({
        customerName: r.customerName,
        customerId: r.customerId,
        plan: r.plan,
        status: r.status,
        startDate: r.startDate,
        endDate: r.endDate,
        priceMinor: r.priceMinor,
        discountMinor: r.discountMinor,
        billingFrequency: r.billingFrequency,
        freezeCount: r.freezeCount,
        daysLeft: daysUntil(r.endDate, now)
      })),
    [rows, now]
  )

  const getRowClassName = (row: MembershipRow): string =>
    row.isBlacklisted
      ? 'bg-destructive/5 hover:bg-destructive/10 data-[state=selected]:!bg-destructive/15'
      : ''

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      isLoading={isLoading}
      initialPageSize={8}
      pageSizeOptions={[8, 16, 32]}
      initialSorting={[{ id: 'period', desc: false }]}
      onRowClick={(row) => onOpenCustomer(row.customerId)}
      getRowClassName={getRowClassName}
      showSearch={false}
      emptyIcon={CreditCard}
      emptyTitle="No memberships match"
      emptyDescription="Try widening the filters to see more entitlement periods."
      headerTone="primary"
      toolbar={
        <ExportExcelButton columns={EXPORT_COLUMNS} rows={exportData} sheetName="Memberships" />
      }
    />
  )
}
