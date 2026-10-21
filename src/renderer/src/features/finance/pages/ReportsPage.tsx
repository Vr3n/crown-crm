import { useMemo, useState } from 'react'
import { Dumbbell, UserRound } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { subDays, startOfMonth, endOfMonth } from 'date-fns'
import { PageHeader } from '@/components/page-header'
import {
  DateRangePicker,
  type DateRangePreset
} from '@/features/dashboard/components/date-range-picker'
import { ExportExcelButton } from '@/features/export/components/export-excel-button'
import type { ExportColumn } from '@/features/export/api'

const REPORT_EXPORT_COLUMNS: ExportColumn[] = [
  { header: 'Invoice', key: 'invoiceNo', format: 'text' },
  { header: 'Issued', key: 'issuedAt', format: 'date' },
  { header: 'Customer', key: 'customer', format: 'text' },
  { header: 'Plan', key: 'plan', format: 'text' },
  { header: 'Billed', key: 'totalMinor', format: 'money' },
  { header: 'Paid', key: 'paidMinor', format: 'money' },
  { header: 'Outstanding', key: 'outstanding', format: 'money' },
  { header: 'Status', key: 'status', format: 'text' }
]
import { ReportsMetrics } from '../components/reports-metrics'
import { CollectionReportCard } from '../components/collection-report-card'
import { MethodShareCard } from '../components/method-share-card'
import { RevenueBreakdownCard } from '../components/revenue-breakdown-card'
import { ReceivablesTable } from '../components/receivables-table'
import { revenueByPlan, revenueByStaff } from '../build'
import { useInvoices, usePayments, useRefunds } from '../queries'

/**
 * Reports (Module 09 §62–63). A financial read over a date range: what came in,
 * by which method, what left, what is still owed, and which plans and staff
 * generated the billed revenue.
 */
export function ReportsPage(): React.JSX.Element {
  const { data: payments, isLoading: loadingPayments } = usePayments()
  const { data: refunds } = useRefunds()
  const { data: invoices, isLoading: loadingInvoices } = useInvoices()
  const [range, setRange] = useState<DateRange | undefined>(undefined)

  const presets = useMemo<DateRangePreset[]>(() => {
    const now = new Date()
    return [
      { label: 'Last 7d', from: subDays(now, 7) },
      { label: 'Last 30d', from: subDays(now, 30) },
      { label: 'Last 90d', from: subDays(now, 90) },
      { label: 'This month', from: startOfMonth(now), to: endOfMonth(now) },
      { label: 'All' }
    ]
  }, [])

  const from = range?.from ?? undefined
  const to = range?.to ?? undefined

  const reportExportData = useMemo(() => {
    const rows = invoices ?? []
    return rows.map((r) => ({
      invoiceNo: r.invoiceNo,
      issuedAt: r.issuedAt,
      customer: r.customer.name,
      plan: r.line?.replace(/\s*\(.*$/, '') ?? '',
      totalMinor: r.totalMinor,
      paidMinor: r.paidMinor,
      outstanding: r.totalMinor - r.paidMinor,
      status: r.status
    }))
  }, [invoices])

  return (
    <div className="flex w-full flex-col gap-6 p-6">
      <PageHeader
        title="Reports"
        description="A financial read: collections, method share, receivables, and revenue by plan and staff."
        actions={
          <>
            <DateRangePicker presets={presets} value={range} onValueChange={setRange} />
            <ExportExcelButton
              columns={REPORT_EXPORT_COLUMNS}
              rows={reportExportData}
              sheetName="Reports"
              filename="reports"
            />
          </>
        }
      />

      <ReportsMetrics payments={payments ?? []} invoices={invoices ?? []} refunds={refunds ?? []} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CollectionReportCard
          payments={payments ?? []}
          refunds={refunds ?? []}
          from={from}
          to={to}
        />
        <MethodShareCard payments={payments ?? []} from={from} to={to} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RevenueBreakdownCard
          title="Revenue by plan"
          icon={Dumbbell}
          tone="primary"
          rows={revenueByPlan(invoices ?? [])}
        />
        <RevenueBreakdownCard
          title="Recorded by staff"
          icon={UserRound}
          tone="success"
          rows={revenueByStaff(payments ?? [])}
        />
      </div>

      <ReceivablesTable invoices={invoices ?? []} isLoading={loadingPayments || loadingInvoices} />
    </div>
  )
}
