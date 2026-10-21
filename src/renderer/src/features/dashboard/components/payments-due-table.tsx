import { useCallback, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { endOfDay, startOfDay, subDays } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import { Wallet } from 'lucide-react'
import { createColumnHelper } from '@tanstack/react-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/features/leads/format'
import { formatMinor } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import { PAGE_SIZE_OPTIONS } from '../constants'
import { usePaymentsDue } from '../queries'
import type { PaymentDue } from '../types'
import { DataTable, type DashboardFeatures, type DataTableColumnMeta } from './data-table'
import { CardPaginationFooter } from './card-pagination-footer'
import { DateRangePicker, type DateRangePreset } from './date-range-picker'
import { ContactCell } from './contact-cell'
import { MemberDetailsSheet } from './member-details-sheet'
import { NameCell } from './name-cell'
import { paymentToRenewTarget } from './renew-target'
import { RenewMembershipDialog } from '@/features/memberships/components/renew-membership-dialog'
import type { Membership } from '@/features/customers/types'
import { RowActions } from './row-actions'
import { SortButton } from './sort-button'
import { ExportExcelButton } from '@/features/export/components/export-excel-button'
import type { ExportColumn } from '@/features/export/api'

const EXPORT_COLUMNS: ExportColumn[] = [
  { header: 'Client Name', key: 'clientName', format: 'text' },
  { header: 'Phone', key: 'phone', format: 'text' },
  { header: 'Email', key: 'email', format: 'text' },
  { header: 'Amount Due', key: 'amountDueMinor', format: 'money' },
  { header: 'Membership Amount', key: 'membershipAmountMinor', format: 'money' },
  { header: 'Plan', key: 'plan', format: 'text' },
  { header: 'Start Date', key: 'planStartDate', format: 'isodate' },
  { header: 'End Date', key: 'planEndDate', format: 'isodate' },
  { header: 'Joining Date', key: 'joiningDate', format: 'isodate' },
  { header: 'Invoice Number', key: 'invoiceNumber', format: 'text' },
  { header: 'Membership Purchased', key: 'membershipPurchasedAt', format: 'isodate' }
]

const helper = createColumnHelper<DashboardFeatures, PaymentDue>()

function buildColumns(
  onView: (row: PaymentDue) => void,
  onMakePayment: (row: PaymentDue) => void,
  onRenew: (row: PaymentDue) => void,
  onFollowUp: (row: PaymentDue) => void
): ReturnType<typeof helper.columns> {
  return helper.columns([
    helper.accessor((row) => row.member.name, {
      id: 'memberName',
      header: ({ column }) => (
        <SortButton sorted={column.getIsSorted()} onClick={() => column.toggleSorting()}>
          Client
        </SortButton>
      ),
      cell: ({ row }) => <NameCell name={row.original.member.name} personId={row.original.member.personId} />,
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
    helper.accessor('amountDueMinor', {
      header: ({ column }) => (
        <SortButton
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting()}
          className="w-full justify-end"
        >
          Amount due
        </SortButton>
      ),
      cell: ({ row }) => (
        <AmountCell amountDue={row.original.amountDueMinor} total={row.original.totalMinor} />
      ),
      meta: { align: 'right' } as DataTableColumnMeta,
      sortFn: 'basic'
    }),
    helper.accessor((row) => row, {
      id: 'plan',
      header: () => <span className="block w-full text-right">Plan</span>,
      enableSorting: false,
      cell: ({ row }) => {
        const name = row.original.plan.replace(/\s*\(.*$/, '')
        return (
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-sm font-medium">{name}</span>
            <span className="text-xs text-muted-foreground">
              Bought {formatDate(row.original.purchasedAt)}
            </span>
          </div>
        )
      },
      meta: { align: 'right' } as DataTableColumnMeta
    }),
    helper.display({
      id: 'actions',
      header: () => null,
      cell: ({ row }) => (
        <RowActions
          memberName={row.original.member.name}
          onView={() => onView(row.original)}
          onMakePayment={() => onMakePayment(row.original)}
          onRenew={
            // Hide Renew when the backend couldn't resolve a membership —
            // renewing the wrong period would misattribute the renewal.
            paymentToRenewTarget(row.original) ? () => onRenew(row.original) : undefined
          }
          onFollowUp={() => onFollowUp(row.original)}
        />
      )
    })
  ])
}

/** Money cell, right-aligned, destructive tone, with the total as muted context. */
function AmountCell({ amountDue, total }: { amountDue: number; total: number }): React.JSX.Element {
  const currency = useCurrency()
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="font-mono text-sm font-semibold tabular-nums text-destructive">
        {formatMinor(amountDue, currency)}
      </span>
      <span className="text-xs text-muted-foreground">of {formatMinor(total, currency)}</span>
    </div>
  )
}

/**
 * Unpaid member obligations (Module 09 §58) — the collection queue. A data
 * table with date-range filter + search, sortable by amount due (largest
 * first by default), pagination and icon-only actions.
 */
export function PaymentsDueTable({
  onMakePayment,
  onFollowUp
}: {
  onMakePayment: (row: PaymentDue) => void
  onFollowUp: (row: PaymentDue) => void
}): React.JSX.Element {
  const { data, isLoading } = usePaymentsDue()
  const navigate = useNavigate()
  const location = useLocation()
  const [range, setRange] = useState<DateRange>()
  const [row, setRow] = useState<PaymentDue | null>(null)
  const [open, setOpen] = useState(false)
  const [renewTarget, setRenewTarget] = useState<Membership | null>(null)

  const handleView = useCallback((selected: PaymentDue) => {
    setRow(selected)
    setOpen(true)
  }, [])

  const handleRowClick = useCallback(
    (row: PaymentDue) => {
      navigate(`/invoices/${row.id}`, { state: { from: location.pathname } })
    },
    [navigate, location.pathname]
  )

  const handleMakePayment = useCallback(
    (selected: PaymentDue) => {
      onMakePayment(selected)
    },
    [onMakePayment]
  )

  const handleRenew = useCallback((selected: PaymentDue) => {
    const target = paymentToRenewTarget(selected)
    if (target) setRenewTarget(target)
  }, [])

  const handleFollowUp = useCallback(
    (selected: PaymentDue) => {
      onFollowUp(selected)
    },
    [onFollowUp]
  )

  const columns = useMemo(
    () => buildColumns(handleView, handleMakePayment, handleRenew, handleFollowUp),
    [handleView, handleMakePayment, handleRenew, handleFollowUp]
  )

  const presets = useMemo<DateRangePreset[]>(() => {
    const now = new Date()
    return [
      { label: 'Last 7d', from: subDays(now, 7) },
      { label: 'Last 30d', from: subDays(now, 30) },
      { label: 'Last 90d', from: subDays(now, 90) },
      { label: 'All' }
    ]
  }, [])

  const filtered = useMemo(() => {
    const rows = (data ?? []).filter((r) => r.amountDueMinor > 0)
    if (!range?.from && !range?.to) return rows
    const from = range.from ? startOfDay(range.from).getTime() : Number.NEGATIVE_INFINITY
    const to = range.to ? endOfDay(range.to).getTime() : Number.POSITIVE_INFINITY
    return rows.filter((r) => {
      const t = new Date(r.purchasedAt).getTime()
      return t >= from && t <= to
    })
  }, [data, range])

  const exportData = useMemo(
    () =>
      filtered.map((r) => ({
        clientName: r.member.name,
        phone: r.member.phone ?? '',
        email: r.member.email ?? '',
        amountDueMinor: r.amountDueMinor,
        membershipAmountMinor: r.membershipAmountMinor,
        plan: r.plan,
        planStartDate: r.planStartDate,
        planEndDate: r.planEndDate,
        joiningDate: r.joiningDate,
        invoiceNumber: r.invoiceNumber,
        membershipPurchasedAt: r.membershipPurchasedAt
      })),
    [filtered]
  )

  return (
    <>
      <Card
        data-testid="payments-due-table"
        className="crm-gradient-border"
        style={
          {
            '--gradient-start': 'var(--destructive)',
            '--gradient-end': 'var(--warning)'
          } as React.CSSProperties
        }
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-lg bg-success/10 text-success">
              <Wallet className="size-4" />
            </span>
            <div>
              <span className="font-heading text-base">Payments due</span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filtered}
            getRowId={(row) => row.id}
            isLoading={isLoading}
            initialSorting={[{ id: 'amountDueMinor', desc: true }]}
            initialPageSize={6}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            showPagination={false}
            footer={<CardPaginationFooter />}
            onRowClick={handleRowClick}
            toolbar={
              <>
                <DateRangePicker
                  presets={presets}
                  value={range}
                  onValueChange={setRange}
                  placeholder="Filter by purchase"
                />
                <ExportExcelButton
                  columns={EXPORT_COLUMNS}
                  rows={exportData}
                  sheetName="Payments Due"
                />
              </>
            }
            searchPlaceholder="Search members…"
            emptyIcon={Wallet}
            emptyTitle="Nothing outstanding"
            emptyDescription="Members with unpaid dues in this range will appear here."
          />
        </CardContent>
      </Card>
      <MemberDetailsSheet row={row} open={open} onOpenChange={setOpen} />
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
