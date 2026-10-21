import { useMemo } from 'react'
import { Download, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { createColumnHelper } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PersonCell } from '@/components/person/person-cell'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { formatDateTime, timeAgo } from '@/features/leads/format'
import { formatMinor } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import { DataTable, type DashboardFeatures } from '@/features/dashboard/components/data-table'
import { SortButton } from '@/features/dashboard/components/sort-button'
import { PAYMENT_METHODS } from '../constants'
import { PaymentMethodBadge } from './payment-method-badge'
import { ExportExcelButton } from '@/features/export/components/export-excel-button'
import { pdfApi } from '@/features/pdf/api'
import type { ExportColumn } from '@/features/export/api'
import type { PaymentMethod, Refund } from '../types'
import type { CurrencyCode } from '@/lib/money'

const EXPORT_COLUMNS: ExportColumn[] = [
  { header: 'Refund No', key: 'refundNo', format: 'text' },
  { header: 'Date', key: 'refundDate', format: 'datetime' },
  { header: 'Recorded By', key: 'createdBy', format: 'text' },
  { header: 'Customer', key: 'customer', format: 'text' },
  { header: 'Phone', key: 'phone', format: 'text' },
  { header: 'Against', key: 'sourcePaymentNo', format: 'text' },
  { header: 'Amount', key: 'amountMinor', format: 'money' },
  { header: 'Reason', key: 'reason', format: 'text' },
  { header: 'Method', key: 'method', format: 'text' }
]

const helper = createColumnHelper<DashboardFeatures, Refund>()

function buildColumns(currency: CurrencyCode): ReturnType<typeof helper.columns> {
  return helper.columns([
    helper.accessor((row) => row.refundNo, {
      id: 'refundNo',
      header: ({ column }) => (
        <SortButton
          className="text-primary"
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
        >
          Refund
        </SortButton>
      ),
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-mono text-sm font-semibold tabular-nums">{row.original.refundNo}</p>
            {row.original.status === 'SCHEDULED' ? (
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                Scheduled
              </Badge>
            ) : row.original.status === 'VOIDED' ? (
              <Badge variant="outline" className="border-border text-muted-foreground">
                Voided
              </Badge>
            ) : null}
          </div>
          <p className="truncate text-xs text-muted-foreground">{row.original.createdBy}</p>
        </div>
      ),
      sortFn: 'alphanumeric'
    }),
    helper.accessor('refundDate', {
      header: ({ column }) => (
        <SortButton
          className="text-primary"
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
        >
          Date
        </SortButton>
      ),
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-xs font-medium tabular-nums">
            {formatDateTime(row.original.refundDate)}
          </span>
          <span className="text-xs text-muted-foreground">{timeAgo(row.original.refundDate)}</span>
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
    helper.accessor('sourcePaymentNo', {
      header: () => 'Against',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.sourcePaymentNo}
        </span>
      )
    }),
    helper.accessor('amountMinor', {
      header: ({ column }) => (
        <SortButton
          className="text-primary"
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
        >
          Amount
        </SortButton>
      ),
      cell: ({ row }) => (
        <span className="font-mono text-sm font-semibold text-destructive tabular-nums">
          −{formatMinor(row.original.amountMinor, currency)}
        </span>
      ),
      sortFn: 'basic'
    }),
    helper.accessor((row) => row.reason, {
      id: 'reason',
      header: () => 'Reason',
      enableSorting: false,
      cell: ({ row }) => (
        <p className="max-w-52 truncate text-sm text-muted-foreground">{row.original.reason}</p>
      )
    }),
    helper.accessor('method', {
      header: () => 'Method',
      enableSorting: false,
      cell: ({ row }) => <PaymentMethodBadge method={row.original.method} />
    }),
    helper.display({
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => (
        <div className="flex items-center justify-end">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Export refund receipt for ${row.original.refundNo}`}
                disabled={row.original.status !== 'ISSUED'}
                onClick={async (e) => {
                  e.stopPropagation()
                  try {
                    const filePath = await pdfApi.exportRefund(row.original.id, 'preview')
                    toast.success('Refund receipt exported', {
                      description: `Saved to ${filePath}`
                    })
                  } catch (err) {
                    toast.error('Export failed', {
                      description: err instanceof Error ? err.message : 'Could not generate receipt'
                    })
                  }
                }}
              >
                <Download className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Export refund receipt as PDF</TooltipContent>
          </Tooltip>
        </div>
      )
    })
  ])
}

/**
 * The refunds table (Module 05 §17). Every refund is a separate, dated, reasoned
 * record layered on top of the source payment — the original payment is never
 * edited, and the "against" column keeps the audit trail visible.
 */
export function RefundsTable({
  refunds,
  isLoading,
  method,
  onMethodChange,
  onOpen
}: {
  refunds: Refund[]
  isLoading: boolean
  method: PaymentMethod | 'ALL'
  onMethodChange: (m: PaymentMethod | 'ALL') => void
  onOpen: (refund: Refund) => void
}): React.JSX.Element {
  const currency = useCurrency()
  const columns = useMemo(() => buildColumns(currency), [currency])

  const exportData = useMemo(
    () =>
      refunds.map((r) => ({
        refundNo: r.refundNo,
        refundDate: r.refundDate,
        createdBy: r.createdBy,
        customer: r.customer.name,
        phone: r.customer.phone,
        sourcePaymentNo: r.sourcePaymentNo,
        amountMinor: r.amountMinor,
        reason: r.reason,
        method: r.method
      })),
    [refunds]
  )

  return (
    <DataTable
      columns={columns}
      data={refunds}
      getRowId={(row) => row.id}
      isLoading={isLoading}
      initialSorting={[{ id: 'refundDate', desc: true }]}
      initialPageSize={8}
      pageSizeOptions={[8, 16, 32]}
      searchPlaceholder="Search refund, customer, reason…"
      onRowClick={onOpen}
      emptyIcon={Undo2}
      emptyTitle="No refunds issued"
      emptyDescription="Refunds you issue from the button above will appear here."
      headerTone="primary"
      toolbar={
        <>
          <Select value={method} onValueChange={(v) => onMethodChange(v as PaymentMethod | 'ALL')}>
            <SelectTrigger size="sm" className="h-8 w-40 gap-1 rounded-md text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              <SelectItem value="ALL">All methods</SelectItem>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m.key} value={m.key}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ExportExcelButton columns={EXPORT_COLUMNS} rows={exportData} sheetName="Refunds" />
        </>
      }
    />
  )
}
