export interface PartyBalance {
  id: number
  name: string
  balanceMinor: number
  isCustomer: boolean
  isSupplier: boolean
}

export interface AgeingBucketMinor {
  bucket: 'Not due' | '1-30' | '31-60' | '61-90' | '90+'
  receivableMinor: number
  payableMinor: number
}

/**
 * Party page read model. Every figure is a query over posted rows. Balances
 * follow the ledger convention: receivables are positive, payables are
 * negative.
 */
export interface PartySummary {
  customerCount: number
  supplierCount: number
  receivableMinor: number
  payableMinor: number
  overdueReceivableMinor: number
  overduePayableMinor: number
  overLimitCount: number
  topReceivables: PartyBalance[]
  topPayables: PartyBalance[]
  ageing: AgeingBucketMinor[]
}

export interface TopItem {
  id: number
  name: string
  valueMinor: number
  qtyE4: number
}

/** Items page read model. */
export interface ItemSummary {
  itemCount: number
  serviceCount: number
  inventoryValueMinor: number
  lowStockCount: number
  outOfStockCount: number
  topItems: TopItem[]
}
