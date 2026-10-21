import { useCallback, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { endOfDay, startOfDay, subDays } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import { Download, Eye, ReceiptText, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { createColumnHelper } from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PersonCell } from '@/components/person/person-cell'
import { formatDate } from '@/features/leads/format'
import { formatMinor, type CurrencyCode } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import { cn } from '@/lib/utils'
import { DataTable, type DashboardFeatures } from '@/features/dashboard/components/data-table'
import {
  DateRangePicker,
  type DateRangePreset
} from '@/features/dashboard/components/date-range-picker'
import { ExportExcelButton } from '@/features/export/components/export-excel-button'
import type { ExportColumn } from '@/features/export/api'

const EXPORT_COLUMNS: ExportColumn[] = [
  { header: 'Invoice', key: 'invoiceNo', format: 'text' },
  { header: 'Issued', key: 'issuedAt', format: 'date' },
  { header: 'Customer', key: 'customer', format: 'text' },
  { header: 'Phone', key: 'phone', format: 'text' },
  { header: 'Plan', key: 'plan', format: 'text' },
  { header: 'Outstanding', key: 'outstanding', format: 'money' },
  { header: 'Final Amount', key: 'total', format: 'money' },
  { header: 'Status', key: 'status', format: 'text' }
]
import { SortButton } from '@/features/dashboard/components/sort-button'
import { INVOICE_PAGE_SIZES, INVOICE_STATUS_META, INVOICE_STATUS_OPTIONS } from '../constants'
import { useInvoices } from '../queries'
import type { Invoice, InvoiceStatus } from '../types'
import { pdfApi } from '@/features/pdf/api'

const helper = createColumnHelper<DashboardFeatures, Invoice>()

function buildColumns(
  onView: (row: Invoice) => void,
  onMakePayment: (row: Invoice) => void,
  currency: CurrencyCode
): ReturnType<typeof helper.columns> {
  return helper.columns([
    helper.accessor('invoiceNo', {
      id: 'invoiceNo',
      header: ({ column }) => (
        <SortButton sorted={column.getIsSorted()} onClick={() => column.toggleSorting()}>
          Invoice
        </SortButton>
      ),
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-sm font-semibold tabular-nums">
            {row.original.invoiceNo}
          </span>
          <span className="text-xs text-muted-foreground">{formatDate(row.original.issuedAt)}</span>
        </div>
      ),
      sortFn: 'alphanumeric'
    }),
    helper.accessor((row) => row.customer.name, {
      id: 'customer',
      header: () => 'Customer / Lead',
      cell: ({ row }) => (
        <PersonCell
          personId={row.original.customer.personId}
          name={row.original.customer.name}
          subtext={
            row.original.customer.phone ? (
              <p className="truncate font-mono text-[11px] text-muted-foreground">
                {row.original.customer.phone}
              </p>
            ) : undefined
          }
        />
      ),
      sortFn: 'alphanumeric'
    }),
    helper.accessor((row) => row.lines[0]?.description ?? '', {
      id: 'plan',
      header: () => 'Membership Plan',
      enableSorting: false,
      cell: ({ row }) => {
        const desc = row.original.lines[0]?.description ?? '—'
        const name = desc.replace(/\s*\(.*$/, '')
        return <span className="block truncate text-sm">{name}</span>
      }
    }),
    helper.accessor('outstandingMinor', {
      id: 'outstanding',
      header: ({ column }) => (
        <div className="flex w-full justify-end">
          <SortButton sorted={column.getIsSorted()} onClick={() => column.toggleSorting()}>
            Outstanding
          </SortButton>
        </div>
      ),
      cell: ({ row }) => {
        const amount = row.original.outstandingMinor
        const isSettled = amount === 0
        return (
          <div className="text-right">
            <span
              className={cn(
                'font-mono text-sm font-semibold tabular-nums',
                isSettled ? 'text-success' : 'text-destructive'
              )}
            >
              {formatMinor(amount, currency)}
            </span>
          </div>
        )
      },
      sortFn: 'basic'
    }),
    helper.accessor('totalMinor', {
      id: 'total',
      header: ({ column }) => (
        <div className="flex w-full justify-end">
          <SortButton sorted={column.getIsSorted()} onClick={() => column.toggleSorting()}>
            Amount
          </SortButton>
        </div>
      ),
      cell: ({ row }) => (
        <div className="text-right">
          <span className="font-mono text-sm font-semibold tabular-nums">
            {formatMinor(row.original.totalMinor, currency)}
          </span>
        </div>
      ),
      sortFn: 'basic'
    }),
    helper.display({
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const isOpenish = row.original.status === 'OPEN' || row.original.status === 'PARTIALLY_PAID'
        return (
          <div className="flex items-center justify-end gap-1.5">
            {isOpenish && row.original.outstandingMinor > 0 ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 border-cyan-500/30 bg-cyan-500/10 px-2 text-xs text-cyan-600 hover:bg-cyan-500/20 hover:text-cyan-700"
                    onClick={(e) => {
                      e.stopPropagation()
                      onMakePayment(row.original)
                    }}
                  >
                    <Wallet className="size-3.5" />
                    Make payment
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Record a payment for this invoice</TooltipContent>
              </Tooltip>
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`Export ${row.original.invoiceNo} as PDF`}
                  onClick={async (e) => {
                    e.stopPropagation()
                    try {
                      const filePath = await pdfApi.exportInvoice(row.original.id, 'preview')
                      toast.success('PDF exported', {
                        description: `Saved to ${filePath}`
                      })
                    } catch (err) {
                      toast.error('Export failed', {
                        description: err instanceof Error ? err.message : 'Could not generate PDF'
                      })
                    }
                  }}
                >
                  <Download className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export invoice as PDF</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="text-primary hover:bg-primary/10 hover:text-primary"
                  aria-label={`View ${row.original.invoiceNo}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onView(row.original)
                  }}
                >
                  <Eye className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>View invoice details</TooltipContent>
            </Tooltip>
          </div>
        )
      }
    })
  ])
}

/**
 * Invoice register (Module 04 / 09 §62) — the authoritative list of finalized
 * obligations. Data table with issued-date range + status filters, search,
 * sortable totals and action buttons on every row.
 */
export function InvoicesTable({
  onMakePayment
}: {
  onMakePayment: (invoice: Invoice) => void
}): React.JSX.Element {
  const { data, isLoading } = useInvoices()
  const navigate = useNavigate()
  const location = useLocation()
  const currency = useCurrency()
  const [range, setRange] = useState<DateRange>()
  const [status, setStatus] = useState<InvoiceStatus | undefined>()

  const handleView = useCallback(
    (row: Invoice) => {
      navigate(`/invoices/${row.id}`, { state: { from: location.pathname } })
    },
    [navigate, location.pathname]
  )

  const columns = useMemo(
    () => buildColumns(handleView, onMakePayment, currency),
    [handleView, onMakePayment, currency]
  )

  const presets = useMemo<DateRangePreset[]>(() => {
    const now = new Date()
    return [
      { label: 'Today', from: startOfDay(now), to: now },
      { label: 'Last 7d', from: subDays(now, 6) },
      { label: 'Last 30d', from: subDays(now, 29) },
      { label: 'All' }
    ]
  }, [])

  const filtered = useMemo(() => {
    const rows = data ?? []
    const byStatus = status ? rows.filter((r) => r.status === status) : rows
    if (!range?.from && !range?.to) return byStatus
    const from = range.from ? startOfDay(range.from).getTime() : Number.NEGATIVE_INFINITY
    const to = range.to ? endOfDay(range.to).getTime() : Number.POSITIVE_INFINITY
    return byStatus.filter((r) => {
      const t = new Date(r.issuedAt).getTime()
      return t >= from && t <= to
    })
  }, [data, range, status])

  const exportData = useMemo(
    () =>
      filtered.map((r) => ({
        invoiceNo: r.invoiceNo,
        issuedAt: r.issuedAt,
        customer: r.customer.name,
        phone: r.customer.phone ?? '',
        plan: r.lines[0]?.description?.replace(/\s*\(.*$/, '') ?? '',
        outstanding: r.outstandingMinor,
        total: r.totalMinor,
        status: r.status
      })),
    [filtered]
  )

  return (
    <>
      <Card className="gap-0 py-0">
        <CardContent className="px-3 py-3">
          <DataTable
            columns={columns}
            data={filtered}
            getRowId={(row) => row.id}
            isLoading={isLoading}
            initialSorting={[{ id: 'invoiceNo', desc: true }]}
            initialPageSize={10}
            pageSizeOptions={INVOICE_PAGE_SIZES}
            headerTone="primary"
            toolbar={
              <>
                <DateRangePicker
                  presets={presets}
                  value={range}
                  onValueChange={setRange}
                  placeholder="Filter by issued"
                />
                <Select
                  value={status ?? 'ALL'}
                  onValueChange={(v) => setStatus(v === 'ALL' ? undefined : (v as InvoiceStatus))}
                >
                  <SelectTrigger
                    size="sm"
                    className="h-8 w-40 gap-2 rounded-md px-3 text-xs shadow-sm"
                  >
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent align="start">
                    <SelectItem value="ALL">All statuses</SelectItem>
                    {INVOICE_STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {INVOICE_STATUS_META[s].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <ExportExcelButton
                  columns={EXPORT_COLUMNS}
                  rows={exportData}
                  sheetName="Invoices"
                />
              </>
            }
            searchPlaceholder="Search invoices…"
            emptyIcon={ReceiptText}
            emptyTitle="No invoices"
            emptyDescription="Invoices in this range and status will appear here."
            onRowClick={(row) => handleView(row)}
          />
        </CardContent>
      </Card>
    </>
  )
}
