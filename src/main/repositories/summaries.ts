import { getDb } from '../db/connection'
import { itemRepo, partyRepo } from './masters'
import { reportRepo } from './reports'
import type {
  AgeingBucketMinor,
  ItemSummary,
  PartyBalance,
  PartySummary
} from '../../shared/contracts/summaries'

const AGEING_BUCKETS: AgeingBucketMinor['bucket'][] = ['Not due', '1-30', '31-60', '61-90', '90+']

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string): number {
  return Math.floor(
    (new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000
  )
}

function bucketFor(dueDate: string | null, today: string): AgeingBucketMinor['bucket'] {
  if (!dueDate) return 'Not due'
  const overdue = daysBetween(dueDate, today)
  if (overdue <= 0) return 'Not due'
  if (overdue <= 30) return '1-30'
  if (overdue <= 60) return '31-60'
  if (overdue <= 90) return '61-90'
  return '90+'
}

interface OpenBill {
  voucher_type: 'SALES' | 'PURCHASE'
  due_date: string | null
  open_minor: number
}

function openBills(companyId: number): OpenBill[] {
  return getDb()
    .prepare(
      `SELECT v.voucher_type, v.due_date,
              v.total_minor - COALESCE(a.amount, 0) AS open_minor
       FROM vouchers v
       LEFT JOIN (
         SELECT to_voucher_id, SUM(amount_minor) AS amount
         FROM bill_allocations GROUP BY to_voucher_id
       ) a ON a.to_voucher_id = v.id
       WHERE v.company_id = ? AND v.status = 'POSTED'
         AND v.voucher_type IN ('SALES', 'PURCHASE')`
    )
    .all(companyId) as unknown as OpenBill[]
}

export const summaryRepo = {
  parties(companyId: number): PartySummary {
    const parties = partyRepo.list(companyId, { role: 'BOTH', includeInactive: false })
    const customers = parties.filter((party) => party.isCustomer)
    const suppliers = parties.filter((party) => party.isSupplier)

    const receivableMinor = customers.reduce(
      (sum, party) => sum + Math.max(0, party.balanceMinor),
      0
    )
    const payableMinor = suppliers.reduce((sum, party) => sum + Math.max(0, -party.balanceMinor), 0)
    const overLimitCount = customers.filter(
      (party) => party.creditLimitMinor > 0 && party.balanceMinor > party.creditLimitMinor
    ).length

    const topReceivables = customers
      .filter((party) => party.balanceMinor > 0)
      .sort((a, b) => b.balanceMinor - a.balanceMinor)
      .slice(0, 6)
      .map((party): PartyBalance => ({
        id: party.id,
        name: party.name,
        balanceMinor: party.balanceMinor,
        isCustomer: true,
        isSupplier: party.isSupplier
      }))

    const topPayables = suppliers
      .filter((party) => party.balanceMinor < 0)
      .sort((a, b) => a.balanceMinor - b.balanceMinor)
      .slice(0, 6)
      .map((party): PartyBalance => ({
        id: party.id,
        name: party.name,
        balanceMinor: -party.balanceMinor,
        isCustomer: party.isCustomer,
        isSupplier: true
      }))

    const ageing: AgeingBucketMinor[] = AGEING_BUCKETS.map((bucket) => ({
      bucket,
      receivableMinor: 0,
      payableMinor: 0
    }))
    const byBucket = new Map(ageing.map((row) => [row.bucket, row]))

    const today = todayIso()
    let overdueReceivableMinor = 0
    let overduePayableMinor = 0

    for (const bill of openBills(companyId)) {
      if (bill.open_minor === 0) continue
      const bucket = byBucket.get(bucketFor(bill.due_date, today))
      if (bucket) {
        if (bill.voucher_type === 'SALES') bucket.receivableMinor += bill.open_minor
        else bucket.payableMinor += bill.open_minor
      }
      if (bill.due_date && bill.due_date < today) {
        if (bill.voucher_type === 'SALES') overdueReceivableMinor += bill.open_minor
        else overduePayableMinor += bill.open_minor
      }
    }

    return {
      customerCount: customers.length,
      supplierCount: suppliers.length,
      receivableMinor,
      payableMinor,
      overdueReceivableMinor,
      overduePayableMinor,
      overLimitCount,
      topReceivables,
      topPayables,
      ageing
    }
  },

  items(companyId: number): ItemSummary {
    const items = itemRepo.list(companyId, undefined, false)
    const stock = new Map(reportRepo.stockSummary(companyId).map((row) => [row.id, row]))

    let inventoryValueMinor = 0
    let lowStockCount = 0
    let outOfStockCount = 0
    const topItems: { id: number; name: string; valueMinor: number; qtyE4: number }[] = []

    for (const item of items) {
      if (item.isService) continue
      const row = stock.get(item.id)
      const qty = row?.qtyE4 ?? item.stockQtyE4
      const value = row?.valueMinor ?? 0
      inventoryValueMinor += value
      topItems.push({ id: item.id, name: item.name, valueMinor: value, qtyE4: qty })

      if (qty <= 0) {
        outOfStockCount += 1
      } else if (item.reorderLevelE4 > 0 && qty <= item.reorderLevelE4) {
        lowStockCount += 1
      }
    }

    topItems.sort((a, b) => b.valueMinor - a.valueMinor)

    return {
      itemCount: items.length,
      serviceCount: items.filter((item) => item.isService).length,
      inventoryValueMinor,
      lowStockCount,
      outOfStockCount,
      topItems: topItems.slice(0, 8)
    }
  }
}
