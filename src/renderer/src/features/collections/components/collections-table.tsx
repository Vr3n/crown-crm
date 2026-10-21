import { useCallback, useMemo, useState } from 'react'
import { Eye, HandCoins } from 'lucide-react'
import { createColumnHelper } from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatTime } from '@/features/leads/format'
import { PAYMENT_METHOD_META } from '@/lib/payment-methods'
import { formatMinor } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import { DataTable, type DashboardFeatures } from '@/features/dashboard/components/data-table'
import { ExportExcelButton } from '@/features/export/components/export-excel-button'
import type { ExportColumn } from '@/features/export/api'
import type { CurrencyCode } from '@/lib/money'

const EXPORT_COLUMNS: ExportColumn[] = [
  { header: 'Reference', key: 'reference', format: 'text' },
  { header: 'Time', key: 'receivedAt', format: 'datetime' },
  { header: 'Customer', key: 'customer', format: 'text' },
  { header: 'Phone', key: 'phone', format: 'text' },
  { header: 'Method', key: 'method', format: 'text' },
  { header: 'Allocated To', key: 'allocatedTo', format: 'text' },
  { header: 'Amount', key: 'amountMinor', format: 'money' },
  { header: 'Recorded By', key: 'receivedBy', format: 'text' }
]
import { PaymentDetailsSheet } from './payment-details-sheet'
import type { PaymentRecord } from '../types'

const helper = createColumnHelper<DashboardFeatures, PaymentRecord>()

function buildColumns(
  onView: (row: PaymentRecord) => void,
  currency: CurrencyCode
): ReturnType<typeof helper.columns> {
  return helper.columns([
    helper.accessor('reference', {
      id: 'reference',
      header: () => 'Reference',
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-sm font-semibold tabular-nums">
            {row.original.reference}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatTime(row.original.receivedAt)}
          </span>
        </div>
      ),
      sortFn: 'text'
    }),
    helper.accessor((row) => row.customer.name, {
      id: 'customer',
      header: () => 'Customer',
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold">{row.original.customer.name}</span>
          {row.original.customer.phone ? (
            <span className="text-xs tabular-nums text-muted-foreground">
              {row.original.customer.phone}
            </span>
          ) : null}
        </div>
      ),
      sortFn: 'alphanumeric'
    }),
    helper.accessor('method', {
      id: 'method',
      header: () => 'Method',
      cell: ({ row }) => {
        const meta = PAYMENT_METHOD_META[row.original.method]
        const Icon = meta.icon
        return (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs font-medium">
            <Icon className="size-3.5" style={{ color: meta.color }} />
            {meta.label}
          </span>
        )
      },
      sortFn: 'text'
    }),
    helper.accessor((row) => row.allocations[0]?.invoiceNo ?? '', {
      id: 'allocatedTo',
      header: () => 'Allocated to',
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          {row.original.allocations.length > 0 ? (
            <span className="font-mono text-sm font-medium tabular-nums">
              {row.original.allocations[0].invoiceNo}
              {row.original.allocations.length > 1
                ? ` +${row.original.allocations.length - 1}`
                : ''}
            </span>
          ) : (
            <span className="text-sm font-medium text-primary">On account</span>
          )}
          {row.original.notes && (
            <span className="max-w-48 truncate text-xs text-muted-foreground">
              {row.original.notes}
            </span>
          )}
        </div>
      ),
      sortFn: 'text'
    }),
    helper.accessor('amountMinor', {
      id: 'amount',
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="xs"
          className="w-full justify-end rounded-md"
          onClick={() => column.toggleSorting()}
        >
          Amount
        </Button>
      ),
      cell: ({ row }) => (
        <span className="block w-full text-right font-mono text-sm font-semibold tabular-nums">
          {formatMinor(row.original.amountMinor, currency)}
        </span>
      ),
      sortFn: 'basic'
    }),
    helper.accessor('receivedBy', {
      id: 'receivedBy',
      header: () => 'Recorded by',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.receivedBy}</span>
      )
    }),
    helper.display({
      id: 'actions',
      header: () => null,
      cell: ({ row }) => (
        <div className="flex items-center justify-end">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon-sm"
                className="text-primary hover:bg-primary/10 hover:text-primary"
                aria-label={`View ${row.original.reference}`}
                onClick={() => onView(row.original)}
              >
                <Eye className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">View payment</TooltipContent>
          </Tooltip>
        </div>
      )
    })
  ])
}

/**
 * The day's payment ledger (Module 09 §63) — every rupee recorded on the
 * selected day, newest first. Rows open a drawer with the method, counterfoil
 * reference and allocation details.
 */
export function CollectionsTable({
  payments,
  isLoading
}: {
  payments: PaymentRecord[]
  isLoading: boolean
}): React.JSX.Element {
  const [selected, setSelected] = useState<PaymentRecord | null>(null)
  const [open, setOpen] = useState(false)
  const currency = useCurrency()

  const handleView = useCallback((row: PaymentRecord) => {
    setSelected(row)
    setOpen(true)
  }, [])
  const columns = useMemo(() => buildColumns(handleView, currency), [handleView, currency])

  const exportData = useMemo(
    () =>
      payments.map((r) => ({
        reference: r.reference,
        receivedAt: r.receivedAt,
        customer: r.customer.name,
        phone: r.customer.phone ?? '',
        method: r.method,
        allocatedTo:
          r.allocations.length > 0
            ? r.allocations.map((a) => a.invoiceNo).join(', ')
            : 'On account',
        amountMinor: r.amountMinor,
        receivedBy: r.receivedBy
      })),
    [payments]
  )

  return (
    <>
      <Card className="gap-0 py-0">
        <CardContent className="px-3 py-3">
          <DataTable
            columns={columns}
            data={payments}
            getRowId={(row) => row.id}
            isLoading={isLoading}
            initialSorting={[{ id: 'reference', desc: false }]}
            initialPageSize={10}
            pageSizeOptions={[10, 20, 50]}
            headerTone="primary"
            toolbar={
              <ExportExcelButton
                columns={EXPORT_COLUMNS}
                rows={exportData}
                sheetName="Collections"
              />
            }
            searchPlaceholder="Search payments…"
            emptyIcon={HandCoins}
            emptyTitle="No payments this day"
            emptyDescription="Nothing was recorded on this date."
            onRowClick={(row) => handleView(row)}
          />
        </CardContent>
      </Card>
      <PaymentDetailsSheet payment={selected} open={open} onOpenChange={setOpen} />
    </>
  )
}
