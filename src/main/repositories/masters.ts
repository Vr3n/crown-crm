import { and, eq, sql } from 'drizzle-orm'
import { getDb, getDrizzle } from '../db/connection'
import {
  accountGroups,
  accounts,
  godowns,
  items,
  partyAccounts,
  parties,
  units
} from '../db/schema'
import type {
  AccountRow,
  CreateAccountInput,
  CreateItemInput,
  CreatePartyInput,
  CreatePartyInput as PartyInput,
  ItemRow,
  PartyListInput,
  PartyRow,
  UpdateItemInput,
  UpdatePartyInput
} from '../../shared/contracts/masters'

function mapParty(row: Record<string, unknown>): PartyRow {
  return {
    id: row.id as number,
    name: row.name as string,
    phone: (row.phone as string) ?? null,
    email: (row.email as string) ?? null,
    gstin: (row.gstin as string) ?? null,
    stateCode: (row.state_code as string) ?? null,
    billingAddress: (row.billing_address as string) ?? null,
    notes: (row.notes as string) ?? null,
    isCustomer: Boolean(row.is_customer),
    isSupplier: Boolean(row.is_supplier),
    creditDays: (row.credit_days as number) ?? 0,
    creditLimitMinor: (row.credit_limit_minor as number) ?? 0,
    openingBalanceMinor: (row.opening_balance_minor as number) ?? 0,
    isActive: Boolean(row.is_active),
    balanceMinor: Number(row.balance_minor ?? 0)
  }
}

export const partyRepo = {
  list(companyId: number, input: PartyListInput): PartyRow[] {
    let where = 'p.company_id = ?'
    const params: (string | number | null)[] = [companyId]
    if (!input.includeInactive) where += ' AND p.is_active = 1'
    if (input.role === 'CUSTOMER') where += ' AND p.is_customer = 1'
    if (input.role === 'SUPPLIER') where += ' AND p.is_supplier = 1'
    if (input.query) {
      const q = `%${input.query.toLowerCase()}%`
      where +=
        " AND (lower(p.name) LIKE ? OR lower(COALESCE(p.phone,'')) LIKE ? OR lower(COALESCE(p.gstin,'')) LIKE ?)"
      params.push(q, q, q)
    }

    const rows = getDb()
      .prepare(
        `SELECT p.*,
          COALESCE((
            SELECT SUM(l.debit_minor - l.credit_minor)
            FROM ledger_lines l
            JOIN party_accounts pa ON pa.account_id = l.account_id
            JOIN vouchers v ON v.id = l.voucher_id AND v.status = 'POSTED'
            WHERE pa.party_id = p.id AND l.company_id = p.company_id
          ), 0) AS balance_minor
         FROM parties p
         WHERE ${where}
         ORDER BY p.name COLLATE NOCASE`
      )
      .all(...params) as Record<string, unknown>[]
    return rows.map(mapParty)
  },

  findById(companyId: number, id: number): PartyRow | null {
    const row = getDb()
      .prepare(
        `SELECT p.*,
          COALESCE((
            SELECT SUM(l.debit_minor - l.credit_minor)
            FROM ledger_lines l
            JOIN party_accounts pa ON pa.account_id = l.account_id
            JOIN vouchers v ON v.id = l.voucher_id AND v.status = 'POSTED'
            WHERE pa.party_id = p.id AND l.company_id = p.company_id
          ), 0) AS balance_minor
         FROM parties p WHERE p.company_id = ? AND p.id = ?`
      )
      .get(companyId, id) as Record<string, unknown> | undefined
    return row ? mapParty(row) : null
  },

  accountsFor(companyId: number, partyId: number): { debtor?: number; creditor?: number } {
    const rows = getDb()
      .prepare(`SELECT role, account_id FROM party_accounts WHERE company_id = ? AND party_id = ?`)
      .all(companyId, partyId) as { role: string; account_id: number }[]
    const result: { debtor?: number; creditor?: number } = {}
    for (const row of rows) {
      if (row.role === 'DEBTOR') result.debtor = row.account_id
      if (row.role === 'CREDITOR') result.creditor = row.account_id
    }
    return result
  },

  create(companyId: number, input: CreatePartyInput, userId: number | null): PartyRow {
    const db = getDrizzle()
    if (!input.isCustomer && !input.isSupplier) {
      throw new Error('Select customer, supplier, or both')
    }
    const created = db
      .insert(parties)
      .values({
        company_id: companyId,
        name: input.name.trim(),
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        gstin: input.gstin?.trim().toUpperCase() || null,
        state_code: input.stateCode || null,
        billing_address: input.billingAddress?.trim() || null,
        is_customer: input.isCustomer,
        is_supplier: input.isSupplier,
        credit_days: input.creditDays,
        credit_limit_minor: input.creditLimitMinor,
        opening_balance_minor: input.openingBalanceMinor,
        opening_balance_date: input.openingBalanceDate || null,
        notes: input.notes?.trim() || null,
        created_by: userId
      })
      .returning({ id: parties.id })
      .get()

    this.ensureAccounts(
      companyId,
      created.id,
      input.name.trim(),
      input.isCustomer,
      input.isSupplier
    )
    return this.findById(companyId, created.id) as PartyRow
  },

  ensureAccounts(
    companyId: number,
    partyId: number,
    partyName: string,
    isCustomer: boolean,
    isSupplier: boolean
  ): void {
    const db = getDrizzle()
    const groups = db
      .select({ id: accountGroups.id, name: accountGroups.name })
      .from(accountGroups)
      .where(eq(accountGroups.company_id, companyId))
      .all()
    const debtorGroup = groups.find((g) => g.name === 'Sundry Debtors')
    const creditorGroup = groups.find((g) => g.name === 'Sundry Creditors')
    if (!debtorGroup || !creditorGroup) throw new Error('Party groups are missing')

    const existing = this.accountsFor(companyId, partyId)

    if (isCustomer && !existing.debtor) {
      const account = db
        .insert(accounts)
        .values({
          company_id: companyId,
          group_id: debtorGroup.id,
          name: partyName,
          type: 'ASSET'
        })
        .returning({ id: accounts.id })
        .get()
      db.insert(partyAccounts)
        .values({
          company_id: companyId,
          party_id: partyId,
          account_id: account.id,
          role: 'DEBTOR'
        })
        .run()
    }

    if (isSupplier && !existing.creditor) {
      const name = isCustomer ? `${partyName} (Creditor)` : partyName
      const account = db
        .insert(accounts)
        .values({
          company_id: companyId,
          group_id: creditorGroup.id,
          name,
          type: 'LIABILITY'
        })
        .returning({ id: accounts.id })
        .get()
      db.insert(partyAccounts)
        .values({
          company_id: companyId,
          party_id: partyId,
          account_id: account.id,
          role: 'CREDITOR'
        })
        .run()
    }
  },

  update(companyId: number, input: UpdatePartyInput): PartyRow {
    const db = getDrizzle()
    const set: Record<string, unknown> = { updated_at: sql`(datetime('now'))` }
    if (input.name !== undefined) set.name = input.name.trim()
    if (input.phone !== undefined) set.phone = input.phone?.trim() || null
    if (input.email !== undefined) set.email = input.email?.trim() || null
    if (input.gstin !== undefined) set.gstin = input.gstin?.trim().toUpperCase() || null
    if (input.stateCode !== undefined) set.state_code = input.stateCode || null
    if (input.billingAddress !== undefined)
      set.billing_address = input.billingAddress?.trim() || null
    if (input.creditDays !== undefined) set.credit_days = input.creditDays
    if (input.creditLimitMinor !== undefined) set.credit_limit_minor = input.creditLimitMinor
    if (input.notes !== undefined) set.notes = input.notes?.trim() || null
    if (input.isCustomer !== undefined) set.is_customer = input.isCustomer
    if (input.isSupplier !== undefined) set.is_supplier = input.isSupplier
    if (input.openingBalanceMinor !== undefined) {
      const posted = getDb()
        .prepare(
          `SELECT 1 AS x FROM vouchers WHERE company_id = ? AND voucher_type = 'OPENING' LIMIT 1`
        )
        .get(companyId)
      if (posted) {
        throw new Error('Opening balances are already posted and cannot be changed')
      }
      set.opening_balance_minor = input.openingBalanceMinor
      if (input.openingBalanceDate !== undefined) {
        set.opening_balance_date = input.openingBalanceDate || null
      }
    }

    db.update(parties)
      .set(set)
      .where(and(eq(parties.company_id, companyId), eq(parties.id, input.id)))
      .run()

    const updated = this.findById(companyId, input.id)
    if (updated && (input.isCustomer !== undefined || input.isSupplier !== undefined)) {
      this.ensureAccounts(
        companyId,
        updated.id,
        updated.name,
        updated.isCustomer,
        updated.isSupplier
      )
    }

    if (input.name !== undefined) {
      const party = this.findById(companyId, input.id)
      if (party) {
        const partyAccountIds = this.accountsFor(companyId, input.id)
        if (partyAccountIds.debtor) {
          db.update(accounts)
            .set({ name: party.name })
            .where(and(eq(accounts.company_id, companyId), eq(accounts.id, partyAccountIds.debtor)))
            .run()
        }
        if (partyAccountIds.creditor) {
          db.update(accounts)
            .set({ name: party.isCustomer ? `${party.name} (Creditor)` : party.name })
            .where(
              and(eq(accounts.company_id, companyId), eq(accounts.id, partyAccountIds.creditor))
            )
            .run()
        }
      }
    }
    return this.findById(companyId, input.id) as PartyRow
  },

  setActive(companyId: number, id: number, active: boolean): void {
    getDrizzle()
      .update(parties)
      .set({ is_active: active })
      .where(and(eq(parties.company_id, companyId), eq(parties.id, id)))
      .run()
  }
}

export const itemRepo = {
  list(companyId: number, query?: string, includeInactive = false): ItemRow[] {
    const rows = getDb()
      .prepare(
        `SELECT i.*, u.name AS uom_name,
          COALESCE((SELECT SUM(m.qty_in_e4 - m.qty_out_e4) FROM stock_movements m
                    JOIN vouchers v ON v.id = m.voucher_id AND v.status = 'POSTED'
                    WHERE m.item_id = i.id), 0) AS stock_qty
         FROM items i LEFT JOIN units u ON u.id = i.uom_id
         WHERE i.company_id = ? ${includeInactive ? '' : 'AND i.is_active = 1'}
           ${query ? "AND (lower(i.name) LIKE ? OR lower(COALESCE(i.sku,'')) LIKE ? OR lower(COALESCE(i.hsn_sac,'')) LIKE ?)" : ''}
         ORDER BY i.name COLLATE NOCASE`
      )
      .all(
        ...[
          companyId,
          ...(query
            ? [`%${query.toLowerCase()}%`, `%${query.toLowerCase()}%`, `%${query.toLowerCase()}%`]
            : [])
        ]
      ) as Record<string, unknown>[]
    return rows.map(mapItem)
  },

  findById(companyId: number, id: number): ItemRow | null {
    const row = getDb()
      .prepare(
        `SELECT i.*, u.name AS uom_name,
          COALESCE((SELECT SUM(m.qty_in_e4 - m.qty_out_e4) FROM stock_movements m
                    JOIN vouchers v ON v.id = m.voucher_id AND v.status = 'POSTED'
                    WHERE m.item_id = i.id), 0) AS stock_qty
         FROM items i LEFT JOIN units u ON u.id = i.uom_id
         WHERE i.company_id = ? AND i.id = ?`
      )
      .get(companyId, id) as Record<string, unknown> | undefined
    return row ? mapItem(row) : null
  },

  create(companyId: number, input: CreateItemInput, userId: number | null): ItemRow {
    const created = getDrizzle()
      .insert(items)
      .values({
        company_id: companyId,
        name: input.name.trim(),
        sku: input.sku?.trim() || null,
        hsn_sac: input.hsnSac?.trim() || null,
        uom_id: input.uomId ?? null,
        gst_rate_bps: input.gstRateBps,
        is_service: input.isService,
        sale_price_minor: input.salePriceMinor,
        purchase_price_minor: input.purchasePriceMinor,
        opening_qty_e4: input.openingQtyE4,
        opening_rate_minor: input.openingRateMinor,
        reorder_level_e4: input.reorderLevelE4,
        created_by: userId
      })
      .returning({ id: items.id })
      .get()
    return this.findById(companyId, created.id) as ItemRow
  },

  update(companyId: number, input: UpdateItemInput): ItemRow {
    const set: Record<string, unknown> = { updated_at: sql`(datetime('now'))` }
    if (input.name !== undefined) set.name = input.name.trim()
    if (input.sku !== undefined) set.sku = input.sku?.trim() || null
    if (input.hsnSac !== undefined) set.hsn_sac = input.hsnSac?.trim() || null
    if (input.uomId !== undefined) set.uom_id = input.uomId
    if (input.gstRateBps !== undefined) set.gst_rate_bps = input.gstRateBps
    if (input.isService !== undefined) set.is_service = input.isService
    if (input.salePriceMinor !== undefined) set.sale_price_minor = input.salePriceMinor
    if (input.purchasePriceMinor !== undefined) set.purchase_price_minor = input.purchasePriceMinor
    if (input.reorderLevelE4 !== undefined) set.reorder_level_e4 = input.reorderLevelE4
    if (input.openingQtyE4 !== undefined || input.openingRateMinor !== undefined) {
      const hasStock = getDb()
        .prepare(`SELECT 1 AS x FROM stock_movements WHERE company_id = ? AND item_id = ? LIMIT 1`)
        .get(companyId, input.id)
      if (hasStock) {
        throw new Error('Opening stock cannot change after the item has movements')
      }
      if (input.openingQtyE4 !== undefined) set.opening_qty_e4 = input.openingQtyE4
      if (input.openingRateMinor !== undefined) set.opening_rate_minor = input.openingRateMinor
    }

    getDrizzle()
      .update(items)
      .set(set)
      .where(and(eq(items.company_id, companyId), eq(items.id, input.id)))
      .run()
    return this.findById(companyId, input.id) as ItemRow
  },

  setActive(companyId: number, id: number, active: boolean): void {
    getDrizzle()
      .update(items)
      .set({ is_active: active })
      .where(and(eq(items.company_id, companyId), eq(items.id, id)))
      .run()
  },

  /** Weighted average unit cost from posted movements. Falls back to purchase price. */
  averageCost(companyId: number, itemId: number): number {
    const row = getDb()
      .prepare(
        `SELECT COALESCE(SUM(m.qty_in_e4 - m.qty_out_e4), 0) AS qty,
                COALESCE(SUM(m.qty_in_e4 * m.unit_cost_minor - m.qty_out_e4 * m.unit_cost_minor), 0) AS value
         FROM stock_movements m
         JOIN vouchers v ON v.id = m.voucher_id AND v.status = 'POSTED'
         WHERE m.company_id = ? AND m.item_id = ?`
      )
      .get(companyId, itemId) as { qty: number; value: number }
    if (row.qty > 0) return Math.round(row.value / row.qty)
    const item = this.findById(companyId, itemId)
    return item?.purchasePriceMinor ?? 0
  }
}

function mapItem(row: Record<string, unknown>): ItemRow {
  return {
    id: row.id as number,
    name: row.name as string,
    sku: (row.sku as string) ?? null,
    hsnSac: (row.hsn_sac as string) ?? null,
    uom: (row.uom_name as string) ?? null,
    uomId: (row.uom_id as number) ?? null,
    gstRateBps: (row.gst_rate_bps as number) ?? 0,
    isService: Boolean(row.is_service),
    salePriceMinor: (row.sale_price_minor as number) ?? 0,
    purchasePriceMinor: (row.purchase_price_minor as number) ?? 0,
    openingQtyE4: (row.opening_qty_e4 as number) ?? 0,
    openingRateMinor: (row.opening_rate_minor as number) ?? 0,
    stockQtyE4: Number(row.stock_qty ?? 0),
    isActive: Boolean(row.is_active)
  }
}

export const accountRepo = {
  list(companyId: number, includeInactive = false): AccountRow[] {
    const rows = getDb()
      .prepare(
        `SELECT a.*, g.name AS group_name,
          COALESCE((SELECT SUM(l.debit_minor - l.credit_minor) FROM ledger_lines l
                    JOIN vouchers v ON v.id = l.voucher_id AND v.status = 'POSTED'
                    WHERE l.account_id = a.id), 0) AS balance_minor
         FROM accounts a JOIN account_groups g ON g.id = a.group_id
         WHERE a.company_id = ? ${includeInactive ? '' : 'AND a.is_active = 1'}
         ORDER BY g.sort_order, a.name COLLATE NOCASE`
      )
      .all(companyId) as Record<string, unknown>[]
    return rows.map((row) => ({
      id: row.id as number,
      name: row.name as string,
      groupName: row.group_name as string,
      type: row.type as string,
      systemKey: (row.system_key as string) ?? null,
      isSystem: Boolean(row.is_system),
      isActive: Boolean(row.is_active),
      balanceMinor: Number(row.balance_minor ?? 0)
    }))
  },

  groups(companyId: number): { id: number; name: string; nature: string }[] {
    return getDrizzle()
      .select({ id: accountGroups.id, name: accountGroups.name, nature: accountGroups.nature })
      .from(accountGroups)
      .where(eq(accountGroups.company_id, companyId))
      .orderBy(accountGroups.sort_order)
      .all()
  },

  create(companyId: number, input: CreateAccountInput): AccountRow {
    const created = getDrizzle()
      .insert(accounts)
      .values({
        company_id: companyId,
        group_id: input.groupId,
        name: input.name.trim(),
        type: input.type,
        opening_balance_minor: input.openingBalanceMinor,
        opening_balance_side: input.openingBalanceSide
      })
      .returning({ id: accounts.id })
      .get()
    return this.list(companyId).find((a) => a.id === created.id) as AccountRow
  },

  setActive(companyId: number, id: number, active: boolean): void {
    getDrizzle()
      .update(accounts)
      .set({ is_active: active })
      .where(and(eq(accounts.company_id, companyId), eq(accounts.id, id)))
      .run()
  },

  /** Resolves the posting engine's reserved accounts by system key. */
  systemKeys(companyId: number): Record<string, number> {
    const rows = getDrizzle()
      .select({ key: accounts.system_key, id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.company_id, companyId), sql`${accounts.system_key} IS NOT NULL`))
      .all()
    const map: Record<string, number> = {}
    for (const row of rows) if (row.key) map[row.key] = row.id
    return map
  }
}

export const unitRepo = {
  list(companyId: number): { id: number; name: string; symbol: string }[] {
    return getDrizzle()
      .select({ id: units.id, name: units.name, symbol: units.symbol })
      .from(units)
      .where(eq(units.company_id, companyId))
      .orderBy(units.name)
      .all()
  }
}

export const godownRepo = {
  list(companyId: number): { id: number; name: string }[] {
    return getDrizzle()
      .select({ id: godowns.id, name: godowns.name })
      .from(godowns)
      .where(eq(godowns.company_id, companyId))
      .orderBy(godowns.id)
      .all()
  }
}

export type { PartyInput }
