import { useMemo } from 'react'
import { PiggyBank } from 'lucide-react'
import { createColumnHelper } from '@tanstack/react-table'
import { PersonCell } from '@/components/person/person-cell'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { formatDateTime, timeAgo } from '@/features/leads/format'
import { formatMinor } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import { DataTable, type DashboardFeatures } from '@/features/dashboard/components/data-table'
import { SortButton } from '@/features/dashboard/components/sort-button'
import { CREDIT_STATUS_META } from '../constants'
import { creditApplied, creditRemaining, creditStatusOf } from '../build'
import { ExportExcelButton } from '@/features/export/components/export-excel-button'
import type { ExportColumn } from '@/features/export/api'
import type { Credit, CreditStatus } from '../types'
import type { CurrencyCode } from '@/lib/money'

const EXPORT_COLUMNS: ExportColumn[] = [
  { header: 'Credit No', key: 'creditNo', format: 'text' },
  { header: 'Issued', key: 'issuedAt', format: 'datetime' },
  { header: 'Recorded By', key: 'createdBy', format: 'text' },
  { header: 'Customer', key: 'customer', format: 'text' },
  { header: 'Phone', key: 'phone', format: 'text' },
  { header: 'Value', key: 'amountMinor', format: 'money' },
  { header: 'Applied', key: 'applied', format: 'money' },
  { header: 'Remaining', key: 'remaining', format: 'money' },
  { header: 'Status', key: 'status', format: 'text' },
  { header: 'Reason', key: 'reason', format: 'text' }
]

const helper = createColumnHelper<DashboardFeatures, Credit>()

function buildColumns(currency: CurrencyCode): ReturnType<typeof helper.columns> {
  return helper.columns([
    helper.accessor((row) => row.creditNo, {
      id: 'creditNo',
      header: ({ column }) => (
        <SortButton
          className="text-primary"
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
        >
          Credit
        </SortButton>
      ),
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold tabular-nums">{row.original.creditNo}</p>
          <p className="truncate text-xs text-muted-foreground">{row.original.createdBy}</p>
        </div>
      ),
      sortFn: 'alphanumeric'
    }),
    helper.accessor('issuedAt', {
      header: ({ column }) => (
        <SortButton
          className="text-primary"
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
        >
          Issued
        </SortButton>
      ),
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-xs font-medium tabular-nums">
            {formatDateTime(row.original.issuedAt)}
          </span>
          <span className="text-xs text-muted-foreground">{timeAgo(row.original.issuedAt)}</span>
        </div>
      ),
      sortFn: 'datetime'
    }),
    helper.accessor((row) => row.customer.name, {
      id: 'customer',
      header: () => 'Customer',
      enableSorting: false,
      cell: ({ row }) => (
        <PersonCell
          personId={row.original.customer.personId}
          name={row.original.customer.name}
          subtext={
            <p className="truncate font-mono text-[11px] text-muted-foreground">
              {row.original.customer.phone}
            </p>
          }
        />
      )
    }),
    helper.accessor('amountMinor', {
      header: ({ column }) => (
        <SortButton
          className="text-primary"
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
        >
          Value
        </SortButton>
      ),
      cell: ({ row }) => (
        <span className="font-mono text-sm font-semibold tabular-nums">
          {formatMinor(row.original.amountMinor, currency)}
        </span>
      ),
      sortFn: 'basic'
    }),
    helper.display({
      id: 'applied',
      header: () => 'Applied',
      cell: ({ row }) => {
        const credit = row.original
        const applied = creditApplied(credit)
        const remaining = creditRemaining(credit)
        return (
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-xs tabular-nums">
              <span className="font-medium">{formatMinor(applied, currency)}</span>
              {remaining > 0 ? (
                <span className="text-muted-foreground">
                  {' '}
                  · {formatMinor(remaining, currency)} left
                </span>
              ) : null}
            </span>
          </div>
        )
      }
    }),
    helper.accessor((row) => creditStatusOf(row), {
      id: 'status',
      header: () => 'Status',
      enableSorting: false,
      cell: ({ row }) => {
        const meta = CREDIT_STATUS_META[creditStatusOf(row.original)]
        return <Badge variant={meta.tone}>{meta.label}</Badge>
      }
    }),
    helper.accessor((row) => row.reason, {
      id: 'reason',
      header: () => 'Source',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="min-w-0 max-w-52">
          <p className="truncate text-sm text-muted-foreground">{row.original.reason}</p>
          {row.original.source ? (
            <p className="truncate text-xs text-muted-foreground/70">{row.original.source}</p>
          ) : null}
        </div>
      )
    })
  ])
}

/**
 * The credits table (Module 05 §18). Credits are value kept inside the business
 * against a future invoice — distinct from refunds. Status derives from how much
 * of the credit's value has already been applied.
 */
export function CreditsTable({
  credits,
  isLoading,
  status,
  onStatusChange,
  onOpen
}: {
  credits: Credit[]
  isLoading: boolean
  status: CreditStatus | 'ALL'
  onStatusChange: (s: CreditStatus | 'ALL') => void
  onOpen: (credit: Credit) => void
}): React.JSX.Element {
  const currency = useCurrency()
  const columns = useMemo(() => buildColumns(currency), [currency])

  const exportData = useMemo(
    () =>
      credits.map((r) => ({
        creditNo: r.creditNo,
        issuedAt: r.issuedAt,
        createdBy: r.createdBy,
        customer: r.customer.name,
        phone: r.customer.phone,
        amountMinor: r.amountMinor,
        applied: creditApplied(r),
        remaining: creditRemaining(r),
        status: creditStatusOf(r),
        reason: r.reason
      })),
    [credits]
  )

  return (
    <DataTable
      columns={columns}
      data={credits}
      getRowId={(row) => row.id}
      isLoading={isLoading}
      initialSorting={[{ id: 'issuedAt', desc: true }]}
      initialPageSize={8}
      pageSizeOptions={[8, 16, 32]}
      searchPlaceholder="Search credit, customer, reason…"
      onRowClick={onOpen}
      emptyIcon={PiggyBank}
      emptyTitle="No credits on account"
      emptyDescription="Credits you add from the button above will appear here."
      headerTone="primary"
      toolbar={
        <>
          <Select value={status} onValueChange={(v) => onStatusChange(v as CreditStatus | 'ALL')}>
            <SelectTrigger size="sm" className="h-8 w-44 gap-1 rounded-md text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              <SelectItem value="ALL">All statuses</SelectItem>
              <SelectItem value="AVAILABLE">Available</SelectItem>
              <SelectItem value="PARTIALLY_APPLIED">Partially applied</SelectItem>
              <SelectItem value="APPLIED">Applied</SelectItem>
            </SelectContent>
          </Select>
          <ExportExcelButton columns={EXPORT_COLUMNS} rows={exportData} sheetName="Credits" />
        </>
      }
    />
  )
}
