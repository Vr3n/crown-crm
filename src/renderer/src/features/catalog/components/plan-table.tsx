import { useMemo } from 'react'
import { History, Package, Pencil, Trash2 } from 'lucide-react'
import { createColumnHelper } from '@tanstack/react-table'
import { DataTable, type DashboardFeatures } from '@/features/dashboard/components/data-table'
import { SortButton } from '@/features/dashboard/components/sort-button'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatMinor, formatRate } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import { billingFrequencyLabel, durationLabel } from '../constants'
import { formatDate } from '../format'
import type { Plan } from '../types'
import { PlanStatusBadge } from './catalog-status-badge'
import { ExportExcelButton } from '@/features/export/components/export-excel-button'
import type { ExportColumn } from '@/features/export/api'
import type { CurrencyCode } from '@/lib/money'

const EXPORT_COLUMNS: ExportColumn[] = [
  { header: 'Name', key: 'name', format: 'text' },
  { header: 'Description', key: 'description', format: 'text' },
  { header: 'Duration', key: 'duration', format: 'text' },
  { header: 'Billing', key: 'billing', format: 'text' },
  { header: 'Price', key: 'priceMinor', format: 'money' },
  { header: 'Tax Rate', key: 'taxRate', format: 'number' },
  { header: 'Tax Code', key: 'taxCode', format: 'text' },
  { header: 'Registration Fee', key: 'registrationFeeMinor', format: 'money' },
  { header: 'Access', key: 'access', format: 'text' },
  { header: 'Available From', key: 'availableFrom', format: 'date' },
  { header: 'Available To', key: 'availableTo', format: 'date' },
  { header: 'Created', key: 'createdAt', format: 'date' },
  { header: 'Status', key: 'status', format: 'text' }
]

const helper = createColumnHelper<DashboardFeatures, Plan>()

function buildColumns(
  onEdit: (plan: Plan) => void,
  onDelete: (plan: Plan) => void,
  onHistory: (plan: Plan) => void,
  currency: CurrencyCode
): ReturnType<typeof helper.columns> {
  return helper.columns([
    helper.accessor((row) => row.name, {
      id: 'name',
      header: ({ column }) => (
        <SortButton
          className="text-primary"
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
        >
          Plan
        </SortButton>
      ),
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{row.original.name}</p>
          <p className="truncate text-xs text-muted-foreground">{row.original.description}</p>
        </div>
      ),
      sortFn: 'alphanumeric'
    }),
    helper.accessor((row) => row.duration, {
      id: 'duration',
      header: ({ column }) => (
        <SortButton
          className="text-primary"
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
        >
          Duration
        </SortButton>
      ),
      cell: ({ row }) => <span className="text-sm">{durationLabel(row.original.duration)}</span>,
      sortFn: 'alphanumeric'
    }),
    helper.accessor((row) => row.billing, {
      id: 'billing',
      header: () => 'Billing',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-sm">{billingFrequencyLabel(row.original.billing)}</span>
      )
    }),
    helper.accessor((row) => row.basePriceMinor, {
      id: 'price',
      header: ({ column }) => (
        <SortButton
          className="text-primary"
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
        >
          Price
        </SortButton>
      ),
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium tabular-nums">
          {formatMinor(row.original.basePriceMinor, currency)}
        </span>
      ),
      sortFn: 'basic'
    }),
    helper.accessor((row) => row.taxRateBps, {
      id: 'tax',
      header: () => 'Tax',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {row.original.taxRateBps > 0
            ? `${row.original.taxCode ?? 'GST'} · ${formatRate(row.original.taxRateBps)}`
            : '—'}
        </span>
      )
    }),
    helper.accessor((row) => row.registrationFeeMinor, {
      id: 'registration',
      header: () => 'Registration',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {row.original.registrationFeeMinor > 0
            ? formatMinor(row.original.registrationFeeMinor, currency)
            : '—'}
        </span>
      )
    }),
    helper.accessor((row) => (row.accessWindow === 'TIMED' ? row.startTime : ''), {
      id: 'access',
      header: () => 'Access',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {row.original.accessWindow === 'TIMED'
            ? `${row.original.startTime}–${row.original.endTime}`
            : 'All hours'}
        </span>
      )
    }),
    helper.accessor((row) => row.createdAt, {
      id: 'created',
      header: () => 'Created',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {formatDate(row.original.createdAt)}
        </span>
      )
    }),
    helper.accessor(
      (row) => {
        const from = row.availableFrom ?? ''
        const to = row.availableTo ?? ''
        return `${from}|${to}`
      },
      {
        id: 'availability',
        header: () => 'Availability',
        enableSorting: false,
        cell: ({ row }) => {
          const { availableFrom, availableTo } = row.original
          if (!availableFrom && !availableTo) {
            return <span className="text-xs text-muted-foreground">Open-ended</span>
          }
          const from = availableFrom ? formatDate(availableFrom) : '—'
          const to = availableTo ? formatDate(availableTo) : 'Open-ended'
          return (
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {from} – {to}
            </span>
          )
        }
      }
    ),
    helper.accessor((row) => row.isActive, {
      id: 'status',
      header: () => 'Status',
      enableSorting: false,
      cell: ({ row }) => <PlanStatusBadge plan={row.original} isActive={row.original.isActive} />
    }),
    helper.display({
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Edit ${row.original.name}`}
                className="size-8 text-muted-foreground hover:text-foreground"
                onClick={() => onEdit(row.original)}
              >
                <Pencil className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit plan</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Price history for ${row.original.name}`}
                className="size-8 text-muted-foreground hover:text-foreground"
                onClick={() => onHistory(row.original)}
              >
                <History className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Price history</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${row.original.name}`}
                className="size-8 text-muted-foreground hover:text-destructive"
                onClick={() => onDelete(row.original)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete plan</TooltipContent>
          </Tooltip>
        </div>
      )
    })
  ])
}

/**
 * The plans list — the current pricing catalog. Row-click opens the editor;
 * deleting a plan also detaches it from any offer that targeted it.
 */
export function PlanTable({
  plans,
  isLoading,
  onEdit,
  onDelete,
  onHistory
}: {
  plans: Plan[]
  isLoading: boolean
  onEdit: (plan: Plan) => void
  onDelete: (plan: Plan) => void
  onHistory: (plan: Plan) => void
}): React.JSX.Element {
  const currency = useCurrency()
  const columns = useMemo(
    () => buildColumns(onEdit, onDelete, onHistory, currency),
    [onEdit, onDelete, onHistory, currency]
  )

  const exportData = useMemo(
    () =>
      plans.map((r) => ({
        name: r.name,
        description: r.description ?? '',
        duration: durationLabel(r.duration),
        billing: billingFrequencyLabel(r.billing),
        priceMinor: r.basePriceMinor,
        taxRate: r.taxRateBps / 100,
        taxCode: r.taxCode ?? '',
        registrationFeeMinor: r.registrationFeeMinor,
        access: r.accessWindow === 'TIMED' ? `${r.startTime}–${r.endTime}` : 'All hours',
        availableFrom: r.availableFrom ?? '',
        availableTo: r.availableTo ?? '',
        createdAt: r.createdAt,
        status: r.isActive ? 'Active' : 'Inactive'
      })),
    [plans]
  )

  return (
    <DataTable
      columns={columns}
      data={plans}
      getRowId={(row) => String(row.id)}
      isLoading={isLoading}
      initialPageSize={8}
      pageSizeOptions={[8, 16, 32]}
      initialSorting={[{ id: 'price', desc: true }]}
      onRowClick={onEdit}
      showSearch={false}
      emptyIcon={Package}
      emptyTitle="No plans match"
      emptyDescription="Try clearing the filters, or add a new plan to the catalog."
      headerTone="primary"
      toolbar={<ExportExcelButton columns={EXPORT_COLUMNS} rows={exportData} sheetName="Plans" />}
    />
  )
}
