import { getDb } from '../db/connection'
import type {
  AgeingBucket,
  AttentionItem,
  DashboardSummary,
  MonthlyTotals,
  RecentVoucher,
  SetupStep
} from '../../shared/contracts/dashboard'

interface OpenBill {
  voucher_type: 'SALES' | 'PURCHASE'
  due_date: string | null
  open_minor: number
}

const AGEING_BUCKETS: AgeingBucket['bucket'][] = ['Not due', '1-30', '31-60', '61-90', '90+']

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(year, monthNumber - 1, 1).toLocaleDateString('en-IN', {
    month: 'short',
    year: '2-digit'
  })
}

function lastMonths(count: number, from: string): string[] {
  const [year, month] = from.split('-').map(Number)
  const months: string[] = []
  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(year, month - 1 - index, 1)
    months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

function daysBetween(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00`).getTime()
  const end = new Date(`${to}T00:00:00`).getTime()
  return Math.floor((end - start) / 86_400_000)
}

function bucketFor(dueDate: string | null, today: string): AgeingBucket['bucket'] {
  if (!dueDate) return 'Not due'
  const overdue = daysBetween(dueDate, today)
  if (overdue <= 0) return 'Not due'
  if (overdue <= 30) return '1-30'
  if (overdue <= 60) return '31-60'
  if (overdue <= 90) return '61-90'
  return '90+'
}

export const dashboardRepo = {
  summary(companyId: number): DashboardSummary {
    const db = getDb()
    const today = todayIso()

    const count = (table: string): number => {
      const row = db
        .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE company_id = ?`)
        .get(companyId) as { n: number } | undefined
      return row?.n ?? 0
    }

    const posted = (type: string): number => {
      const row = db
        .prepare(
          `SELECT COUNT(*) AS n FROM vouchers
           WHERE company_id = ? AND voucher_type = ? AND status = 'POSTED'`
        )
        .get(companyId, type) as { n: number } | undefined
      return row?.n ?? 0
    }

    const outstanding = (type: 'SALES' | 'PURCHASE'): number => {
      const row = db
        .prepare(
          `SELECT COALESCE(SUM(
             v.total_minor - COALESCE((
               SELECT SUM(a.amount_minor) FROM bill_allocations a WHERE a.to_voucher_id = v.id
             ), 0)
           ), 0) AS amount
           FROM vouchers v
           WHERE v.company_id = ? AND v.voucher_type = ? AND v.status = 'POSTED'`
        )
        .get(companyId, type) as { amount: number } | undefined
      return row?.amount ?? 0
    }

    const cashBank = db
      .prepare(
        `SELECT COALESCE(SUM(l.debit_minor - l.credit_minor), 0) AS amount
         FROM ledger_lines l
         JOIN accounts a ON a.id = l.account_id
         WHERE l.company_id = ? AND a.system_key IN ('CASH', 'BANK')`
      )
      .get(companyId) as { amount: number } | undefined

    const company = db
      .prepare(
        'SELECT numbering_setup_at, onboarding_completed_at FROM companies WHERE id = ?'
      )
      .get(companyId) as
      | { numbering_setup_at: string | null; onboarding_completed_at: string | null }
      | undefined

    const partyCount = count('parties')
    const itemCount = count('items')
    const purchaseCount = posted('PURCHASE')
    const salesCount = posted('SALES')
    const openingCount = posted('OPENING')

    const steps: SetupStep[] = [
      {
        id: 'numbering',
        label: 'Number your vouchers',
        detail: 'Series and starting numbers are set.',
        href: '/settings/numbering',
        done: Boolean(company?.numbering_setup_at)
      },
      {
        id: 'parties',
        label: 'Add parties',
        detail: 'Customers, suppliers and their credit terms.',
        href: '/parties',
        done: partyCount > 0
      },
      {
        id: 'items',
        label: 'Add items',
        detail: 'HSN, unit, GST rate and selling price.',
        href: '/items',
        done: itemCount > 0
      },
      {
        id: 'opening',
        label: 'Post opening balances',
        detail: 'What the books carried in on day one.',
        href: '/settings/company',
        done: openingCount > 0
      },
      {
        id: 'purchase',
        label: 'Post a purchase bill',
        detail: 'Stock in, ledger written, payable recorded.',
        href: '/purchases/new',
        done: purchaseCount > 0
      },
      {
        id: 'sale',
        label: 'Post a sales invoice',
        detail: 'Stock out, GST recorded, receivable created.',
        href: '/sales/new',
        done: salesCount > 0
      }
    ]

    const openBills = db
      .prepare(
        `SELECT v.voucher_type,
                v.due_date,
                v.total_minor - COALESCE(a.amount, 0) AS open_minor
         FROM vouchers v
         LEFT JOIN (
           SELECT to_voucher_id, SUM(amount_minor) AS amount
           FROM bill_allocations
           GROUP BY to_voucher_id
         ) a ON a.to_voucher_id = v.id
         WHERE v.company_id = ?
           AND v.status = 'POSTED'
           AND v.voucher_type IN ('SALES', 'PURCHASE')`
      )
      .all(companyId) as unknown as OpenBill[]

    const ageing = AGEING_BUCKETS.map((bucket) => ({
      bucket,
      receivableMinor: 0,
      payableMinor: 0
    }))
    const ageingByBucket = new Map(ageing.map((row) => [row.bucket, row]))

    let overdueMinor = 0
    let overdueCount = 0
    let dueSoonMinor = 0
    let dueSoonCount = 0
    const soon = addDays(today, 7)

    for (const bill of openBills) {
      if (bill.open_minor === 0) continue
      const bucket = ageingByBucket.get(bucketFor(bill.due_date, today))
      if (bucket) {
        if (bill.voucher_type === 'SALES') bucket.receivableMinor += bill.open_minor
        else bucket.payableMinor += bill.open_minor
      }

      if (bill.due_date && bill.due_date < today) {
        overdueCount += 1
        if (bill.voucher_type === 'SALES') overdueMinor += bill.open_minor
      }
      if (
        bill.voucher_type === 'PURCHASE' &&
        bill.due_date &&
        bill.due_date >= today &&
        bill.due_date <= soon
      ) {
        dueSoonCount += 1
        dueSoonMinor += bill.open_minor
      }
    }

    const attention: AttentionItem[] = []
    if (overdueCount > 0) {
      attention.push({
        id: 'overdue',
        tone: 'destructive',
        title: `${overdueCount} invoice${overdueCount === 1 ? '' : 's'} overdue`,
        detail: 'Follow up on the oldest receivables first.',
        href: '/reports/receivables'
      })
    }
    if (dueSoonCount > 0) {
      attention.push({
        id: 'due-soon',
        tone: 'warning',
        title: `${dueSoonCount} supplier bill${dueSoonCount === 1 ? '' : 's'} due this week`,
        detail: 'Check the cash position before paying.',
        href: '/reports/payables'
      })
    }
    if (attention.length === 0) {
      attention.push({
        id: 'clear',
        tone: 'info',
        title: 'Nothing overdue',
        detail: 'Every open bill is still inside its credit period.',
        href: '/reports/ageing'
      })
    }

    const recentVouchers = db
      .prepare(
        `SELECT v.id, v.voucher_type AS type, v.number, v.voucher_date AS date,
                p.name AS partyName, v.total_minor AS totalMinor
         FROM vouchers v
         LEFT JOIN parties p ON p.id = v.party_id
         WHERE v.company_id = ? AND v.status = 'POSTED'
         ORDER BY v.voucher_date DESC, v.id DESC
         LIMIT 5`
      )
      .all(companyId) as unknown as RecentVoucher[]

    const monthRows = db
      .prepare(
        `SELECT substr(v.voucher_date, 1, 7) AS month, v.voucher_type AS type,
                COALESCE(SUM(v.total_minor), 0) AS amount
         FROM vouchers v
         WHERE v.company_id = ? AND v.status = 'POSTED'
           AND v.voucher_type IN ('SALES', 'PURCHASE')
         GROUP BY month, type`
      )
      .all(companyId) as { month: string; type: string; amount: number }[]

    const byMonth = new Map<string, MonthlyTotals>()
    for (const month of lastMonths(6, today)) {
      byMonth.set(month, {
        month,
        label: monthLabel(month),
        salesMinor: 0,
        purchasesMinor: 0
      })
    }
    for (const row of monthRows) {
      const entry = byMonth.get(row.month)
      if (!entry) continue
      if (row.type === 'SALES') entry.salesMinor = row.amount
      if (row.type === 'PURCHASE') entry.purchasesMinor = row.amount
    }

    return {
      partyCount,
      itemCount,
      voucherCount: count('vouchers'),
      receivableMinor: outstanding('SALES'),
      payableMinor: outstanding('PURCHASE'),
      cashBankMinor: cashBank?.amount ?? 0,
      setup: {
        done: steps.filter((step) => step.done).length,
        total: steps.length,
        steps
      },
      attention,
      recentVouchers,
      monthly: [...byMonth.values()],
      ageing
    }
  }
}
