import type {
  CreateItemInput,
  CreatePartyInput,
  ItemRow,
  PartyRow
} from '@shared/contracts/masters'
import type { PostVoucherInput } from '@shared/contracts/vouchers'
import type { ImportRuntime } from './runtime'

const UOM_NOS = 1

function party(
  id: number,
  name: string,
  gstin: string | null,
  roles: { customer: boolean; supplier: boolean },
  phone: string
): PartyRow {
  return {
    id,
    name,
    phone,
    email: null,
    gstin,
    stateCode: '27',
    billingAddress: null,
    notes: null,
    isCustomer: roles.customer,
    isSupplier: roles.supplier,
    creditDays: 30,
    creditLimitMinor: 0,
    openingBalanceMinor: 0,
    isActive: true,
    balanceMinor: 0
  }
}

function item(
  id: number,
  name: string,
  sku: string,
  hsnSac: string,
  gstRateBps: number,
  purchasePriceMinor: number,
  salePriceMinor: number
): ItemRow {
  return {
    id,
    name,
    sku,
    hsnSac,
    uom: 'Nos',
    uomId: UOM_NOS,
    gstRateBps,
    cessRateBps: 0,
    isService: false,
    salePriceMinor,
    purchasePriceMinor,
    salePriceIncludesTax: false,
    purchasePriceIncludesTax: false,
    openingQtyE4: 0,
    openingRateMinor: 0,
    stockQtyE4: 0,
    reorderLevelE4: 0,
    stockGroupId: null,
    stockGroup: null,
    isActive: true
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * A runtime with the same shape as the app, backed by fixtures.
 *
 * The browser prototype and the end-to-end renderer test use this, so the flow
 * can be driven without a Tauri build or a database.
 */
export function createDemoRuntime(): ImportRuntime {
  const parties: PartyRow[] = [
    party(
      1,
      'Sharma Traders',
      '27AABCS1234C1Z5',
      { customer: false, supplier: true },
      '98200 11223'
    ),
    party(
      2,
      'Patel Electronics',
      '27AAACP5678D1Z2',
      { customer: true, supplier: true },
      '98200 44556'
    ),
    party(
      3,
      'Krishna Distributors',
      '27AAACK9012E1Z9',
      { customer: false, supplier: true },
      '98200 77889'
    ),
    party(4, 'Gupta Stores', null, { customer: true, supplier: false }, '98200 33445')
  ]
  const items: ItemRow[] = [
    item(101, 'SSD 256GB', 'SSD-256', '8523', 1800, 385_593, 420_000),
    item(102, 'USB-C Cable', 'CBL-UC', '8544', 1800, 45_000, 52_000),
    item(103, 'Keyboard', 'KBD-01', '8471', 1800, 125_000, 145_000),
    item(104, 'Monitor 24 inch', 'MON-24', '8528', 1800, 1_200_000, 1_500_000),
    item(105, 'Monitor Stand', 'STD-01', '8302', 1800, 180_000, 220_000),
    item(106, 'Office Chair', 'CHR-01', '9401', 1800, 520_000, 650_000),
    item(107, 'Thermal Paper Roll', 'TPR-01', '4823', 1200, 32_000, 38_000),
    item(108, 'HDMI Cable', 'CBL-HD', '8544', 1800, 65_000, 75_000),
    item(109, 'Desk Lamp', 'LMP-01', '9405', 1800, 95_000, 115_000)
  ]

  let nextPartyId = 10
  let nextItemId = 200
  let nextVoucherId = 1
  const counters = { PURCHASE: 0, SALES: 0 }

  return {
    source: 'demo',
    async company() {
      return { stateCode: '27', roundOffMode: 'INVOICE' }
    },
    async listParties() {
      return parties.map((row) => ({ ...row }))
    },
    async listItems() {
      return items.map((row) => ({ ...row }))
    },
    async createParty(input: CreatePartyInput) {
      await wait(120)
      const created: PartyRow = {
        id: nextPartyId++,
        name: input.name,
        phone: input.phone ?? null,
        email: input.email ?? null,
        gstin: input.gstin ?? null,
        stateCode: input.stateCode ?? null,
        billingAddress: input.billingAddress ?? null,
        notes: input.notes ?? null,
        isCustomer: input.isCustomer,
        isSupplier: input.isSupplier,
        creditDays: input.creditDays,
        creditLimitMinor: input.creditLimitMinor,
        openingBalanceMinor: input.openingBalanceMinor,
        isActive: true,
        balanceMinor: 0
      }
      parties.push(created)
      return { ...created }
    },
    async createItem(input: CreateItemInput) {
      await wait(120)
      const created: ItemRow = {
        id: nextItemId++,
        name: input.name,
        sku: input.sku ?? null,
        hsnSac: input.hsnSac ?? null,
        uom: null,
        uomId: input.uomId ?? null,
        gstRateBps: input.gstRateBps,
        cessRateBps: input.cessRateBps,
        isService: input.isService,
        salePriceMinor: input.salePriceMinor,
        purchasePriceMinor: input.purchasePriceMinor,
        salePriceIncludesTax: input.salePriceIncludesTax,
        purchasePriceIncludesTax: input.purchasePriceIncludesTax,
        openingQtyE4: input.openingQtyE4,
        openingRateMinor: input.openingRateMinor,
        stockQtyE4: 0,
        reorderLevelE4: input.reorderLevelE4,
        stockGroupId: null,
        stockGroup: null,
        isActive: true
      }
      items.push(created)
      return { ...created }
    },
    async postVoucher(input: PostVoucherInput) {
      await wait(280)
      if (input.supplierBillNo === 'DUP-1') {
        const error = new Error(
          'This supplier bill number is already posted for this supplier and financial year.'
        ) as Error & { code?: string }
        error.code = 'DUPLICATE_SUPPLIER_BILL'
        throw error
      }
      counters[input.type as 'PURCHASE' | 'SALES'] += 1
      const number = `${input.type === 'PURCHASE' ? 'PUR' : 'INV'}/${String(
        counters[input.type as 'PURCHASE' | 'SALES']
      ).padStart(4, '0')}`
      return { id: nextVoucherId++, number }
    }
  }
}
