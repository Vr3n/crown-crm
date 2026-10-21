import { useMemo } from 'react'
import { Download, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { createColumnHelper } from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PersonCell } from '@/components/person/person-cell'
import { formatDateTime, timeAgo } from '@/features/leads/format'
import { formatMinor } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import { DataTable, type DashboardFeatures } from '@/features/dashboard/components/data-table'
import { SortButton } from '@/features/dashboard/components/sort-button'
import { cn } from '@/lib/utils'
import { ALLOCATION_STATUS_META } from '../constants'
import { allocatedAmount, allocationStatusOf, unallocatedAmount } from '../build'
import { PaymentMethodBadge } from './payment-method-badge'
import { pdfApi } from '@/features/pdf/api'
import { ExportExcelButton } from '@/features/export/components/export-excel-button'
import type { ExportColumn } from '@/features/export/api'
import type { Payment } from '../types'
import type { CurrencyCode } from '@/lib/money'

const EXPORT_COLUMNS: ExportColumn[] = [
  { header: 'Payment No', key: 'paymentNo', format: 'text' },
  { header: 'Date', key: 'paymentDate', format: 'date' },
  { header: 'Recorded By', key: 'createdBy', format: 'text' },
  { header: 'Customer', key: 'customer', format: 'text' },
  { header: 'Phone', key: 'phone', format: 'text' },
  { header: 'Method', key: 'method', format: 'text' },
  { header: 'Amount', key: 'amountMinor', format: 'money' },
  { header: 'Allocated', key: 'allocated', format: 'money' },
  { header: 'Unallocated', key: 'unallocated', format: 'money' },
  { header: 'Reference', key: 'reference', format: 'text' }
]

const helper = createColumnHelper<DashboardFeatures, Payment>()

/** Allocated column: mono "of" figures with a thin progress bar. */
function AllocatedCell({
  payment,
  currency
}: {
  payment: Payment
  currency: CurrencyCode
}): React.JSX.Element {
  const allocated = allocatedAmount(payment)
  const pct = payment.amountMinor > 0 ? Math.round((allocated / payment.amountMinor) * 100) : 0
  return (
    <div className="flex min-w-28 flex-col gap-1.5">
      <span className="font-mono text-xs tabular-nums">
        <span className="font-medium">{formatMinor(allocated, currency)}</span>
        <span className="text-muted-foreground">
          {' '}
          of {formatMinor(payment.amountMinor, currency)}
        </span>
      </span>
      <span className="flex h-1 w-full max-w-32 overflow-hidden rounded-full bg-muted">
        <span
          className={cn(
            'h-full rounded-full',
            pct >= 100 ? 'bg-success' : pct > 0 ? 'bg-warning' : 'bg-muted-foreground/30'
          )}
          style={{ width: `${Math.max(pct, 4)}%` }}
        />
      </span>
    </div>
  )
}

function buildColumns(currency: CurrencyCode): ReturnType<typeof helper.columns> {
  return helper.columns([
    helper.accessor((row) => row.paymentNo, {
      id: 'paymentNo',
      header: ({ column }) => (
        <SortButton
          className="text-primary"
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
        >
          Payment
        </SortButton>
      ),
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold tabular-nums">{row.original.paymentNo}</p>
          <p className="truncate text-xs text-muted-foreground">{row.original.createdBy}</p>
        </div>
      ),
      sortFn: 'alphanumeric'
    }),
    helper.accessor('paymentDate', {
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
            {formatDateTime(row.original.paymentDate)}
          </span>
          <span className="text-xs text-muted-foreground">{timeAgo(row.original.paymentDate)}</span>
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
    helper.accessor('method', {
      header: () => 'Method',
      enableSorting: false,
      cell: ({ row }) => <PaymentMethodBadge method={row.original.method} />
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
        <span className="font-mono text-sm font-semibold tabular-nums">
          {formatMinor(row.original.amountMinor, currency)}
        </span>
      ),
      sortFn: 'basic'
    }),
    helper.display({
      id: 'allocated',
      header: () => 'Allocated',
      cell: ({ row }) => <AllocatedCell payment={row.original} currency={currency} />
    }),
    helper.accessor((row) => allocationStatusOf(row), {
      id: 'status',
      header: () => 'Status',
      enableSorting: false,
      cell: ({ row }) => {
        const meta = ALLOCATION_STATUS_META[allocationStatusOf(row.original)]
        return <Badge variant={meta.tone}>{meta.label}</Badge>
      }
    }),
    helper.accessor((row) => row.reference ?? '', {
      id: 'reference',
      header: () => 'Reference',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.reference ?? '—'}
        </span>
      )
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
                aria-label={`Print receipt for ${row.original.paymentNo}`}
                onClick={async (e) => {
                  e.stopPropagation()
                  try {
                    const paymentId = parseInt(row.original.id, 10)
                    const filePath = await pdfApi.exportReceipt(paymentId, 'preview')
                    toast.success('Receipt exported', {
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
            <TooltipContent>Export payment receipt as PDF</TooltipContent>
          </Tooltip>
        </div>
      )
    })
  ])
}

/**
 * The payments workbench table (Module 05 §15–16). Every payment row shows what
 * arrived, how it was received, and how much of it is already spread over
 * invoices. Row-click opens the payment record with its allocations + refunds.
 */
export function PaymentsTable({
  payments,
  isLoading,
  onOpen
}: {
  payments: Payment[]
  isLoading: boolean
  onOpen: (payment: Payment) => void
}): React.JSX.Element {
  const currency = useCurrency()
  const columns = useMemo(() => buildColumns(currency), [currency])
  const unallocatedTotal = payments.reduce((s, p) => s + unallocatedAmount(p), 0)

  const exportData = useMemo(
    () =>
      payments.map((r) => ({
        paymentNo: r.paymentNo,
        paymentDate: r.paymentDate,
        createdBy: r.createdBy,
        customer: r.customer.name,
        phone: r.customer.phone,
        method: r.method,
        amountMinor: r.amountMinor,
        allocated: allocatedAmount(r),
        unallocated: unallocatedAmount(r),
        reference: r.reference ?? ''
      })),
    [payments]
  )

  return (
    <DataTable
      columns={columns}
      data={payments}
      getRowId={(row) => row.id}
      isLoading={isLoading}
      initialSorting={[{ id: 'paymentDate', desc: true }]}
      initialPageSize={8}
      pageSizeOptions={[8, 16, 32]}
      searchPlaceholder="Search payment, customer, reference…"
      onRowClick={onOpen}
      emptyIcon={Wallet}
      emptyTitle="No payments recorded"
      emptyDescription="Record the first payment from the button above."
      headerTone="primary"
      toolbar={
        <>
          {unallocatedTotal > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/25 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning tabular-nums">
              {formatMinor(unallocatedTotal, currency)} unallocated
            </span>
          ) : null}
          <ExportExcelButton columns={EXPORT_COLUMNS} rows={exportData} sheetName="Payments" />
        </>
      }
    />
  )
}
