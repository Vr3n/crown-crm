import { useMemo } from 'react'
import { Archive, BadgePercent, History, Pencil } from 'lucide-react'
import { createColumnHelper } from '@tanstack/react-table'
import { DataTable, type DashboardFeatures } from '@/features/dashboard/components/data-table'
import { SortButton } from '@/features/dashboard/components/sort-button'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { discountBadgeText } from '../pricing'
import { formatDate } from '../format'
import { useCurrency } from '@/hooks/use-currency'
import type { Offer, Plan } from '../types'
import type { CurrencyCode } from '@/lib/money'
import { OfferLifecycleBadge } from './catalog-status-badge'
import { ExportExcelButton } from '@/features/export/components/export-excel-button'
import type { ExportColumn } from '@/features/export/api'

const EXPORT_COLUMNS: ExportColumn[] = [
  { header: 'Name', key: 'name', format: 'text' },
  { header: 'Code', key: 'code', format: 'text' },
  { header: 'Discount', key: 'discount', format: 'text' },
  { header: 'Applies To', key: 'appliesTo', format: 'text' },
  { header: 'Start', key: 'startDate', format: 'date' },
  { header: 'End', key: 'endDate', format: 'date' },
  { header: 'Uses', key: 'uses', format: 'text' },
  { header: 'Lifecycle', key: 'lifecycle', format: 'text' }
]

const helper = createColumnHelper<DashboardFeatures, Offer>()

const appliesToLabel = (offer: Offer, plans: Plan[]): string => {
  if (offer.applicablePlanIds.length === 0) return 'All plans'
  const names = plans.filter((p) => offer.applicablePlanIds.includes(p.id)).map((p) => p.name)
  return names.length === 0 ? 'No plans' : names.join(', ')
}

function buildColumns(
  plans: Plan[],
  onEdit: (offer: Offer) => void,
  onDeactivate: (offer: Offer) => void,
  onHistory: (offer: Offer) => void,
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
          Offer
        </SortButton>
      ),
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{row.original.name}</p>
          <p className="font-mono text-xs text-muted-foreground tabular-nums">
            {row.original.code}
          </p>
        </div>
      ),
      sortFn: 'alphanumeric'
    }),
    helper.accessor((row) => discountBadgeText(row, currency), {
      id: 'discount',
      header: () => 'Discount',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1.5 font-mono text-sm font-medium text-primary tabular-nums">
          <BadgePercent className="size-3.5 text-primary/70" />
          {discountBadgeText(row.original, currency)}
        </span>
      )
    }),
    helper.accessor((row) => appliesToLabel(row, plans), {
      id: 'applies',
      header: () => 'Applies to',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{appliesToLabel(row.original, plans)}</span>
      )
    }),
    helper.accessor((row) => row.startDate, {
      id: 'period',
      header: () => 'Period',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {formatDate(row.original.startDate)} →{' '}
          {row.original.endDate ? formatDate(row.original.endDate) : 'Open'}
        </span>
      )
    }),
    helper.accessor((row) => row.usedCount, {
      id: 'usage',
      header: () => 'Uses',
      enableSorting: false,
      cell: ({ row }) => {
        const exhausted = row.original.maxUses > 0 && row.original.usedCount >= row.original.maxUses
        return (
          <span
            className={cn(
              'font-mono text-xs tabular-nums',
              exhausted ? 'text-warning' : 'text-muted-foreground'
            )}
          >
            {row.original.maxUses > 0
              ? `${row.original.usedCount} / ${row.original.maxUses}`
              : `${row.original.usedCount} used`}
          </span>
        )
      }
    }),
    helper.accessor((row) => row.endDate, {
      id: 'lifecycle',
      header: () => 'Lifecycle',
      enableSorting: false,
      cell: ({ row }) => <OfferLifecycleBadge offer={row.original} />
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
                aria-label={`Discount history for ${row.original.name}`}
                className="size-8 text-muted-foreground hover:text-foreground"
                onClick={() => onHistory(row.original)}
              >
                <History className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Discount history</TooltipContent>
          </Tooltip>
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
            <TooltipContent>Edit offer</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Deactivate ${row.original.name}`}
                className="size-8 text-muted-foreground hover:text-warning"
                onClick={() => onDeactivate(row.original)}
              >
                <Archive className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Deactivate offer</TooltipContent>
          </Tooltip>
        </div>
      )
    })
  ])
}

/**
 * The offers list — pricing rules that sit on top of plans and are snapshotted
 * onto the invoice at sale time. Row-click opens the editor.
 */
export function OfferTable({
  offers,
  plans,
  isLoading,
  onEdit,
  onDeactivate,
  onHistory
}: {
  offers: Offer[]
  plans: Plan[]
  isLoading: boolean
  onEdit: (offer: Offer) => void
  onDeactivate: (offer: Offer) => void
  onHistory: (offer: Offer) => void
}): React.JSX.Element {
  const currency = useCurrency()
  const columns = useMemo(
    () => buildColumns(plans, onEdit, onDeactivate, onHistory, currency),
    [plans, onEdit, onDeactivate, onHistory, currency]
  )

  const exportData = useMemo(
    () =>
      offers.map((r) => ({
        name: r.name,
        code: r.code,
        discount: discountBadgeText(r, currency),
        appliesTo: appliesToLabel(r, plans),
        startDate: r.startDate,
        endDate: r.endDate ?? '',
        uses: r.maxUses > 0 ? `${r.usedCount} / ${r.maxUses}` : `${r.usedCount} used`,
        lifecycle: r.endDate ? 'Fixed' : 'Open'
      })),
    [offers, plans, currency]
  )

  return (
    <DataTable
      columns={columns}
      data={offers}
      getRowId={(row) => String(row.id)}
      isLoading={isLoading}
      initialPageSize={8}
      pageSizeOptions={[8, 16, 32]}
      onRowClick={onEdit}
      showSearch={false}
      emptyIcon={BadgePercent}
      emptyTitle="No offers match"
      emptyDescription="Try clearing the filters, or create a new offer to layer on the catalog."
      headerTone="primary"
      toolbar={<ExportExcelButton columns={EXPORT_COLUMNS} rows={exportData} sheetName="Offers" />}
    />
  )
}
