import { and, eq, like, or, sql } from 'drizzle-orm'
import { getDrizzle } from '../db/connection'
import { accountGroups, accounts, items, parties, vouchers } from '../db/schema'
import type { SearchKind, SearchResult } from '../../shared/contracts/search'

/** One group at a time, capped so the palette stays quick to scan. */
export const SEARCH_GROUP_LIMIT = 5

function pattern(query: string): string {
  return `%${query.trim().toLowerCase()}%`
}

function roleLabel(isCustomer: boolean, isSupplier: boolean): string {
  if (isCustomer && isSupplier) return 'Customer and supplier'
  if (isCustomer) return 'Customer'
  if (isSupplier) return 'Supplier'
  return 'Party'
}

/**
 * Read-only search across the four master/document families the palette
 * exposes. Permission checks live in the application layer; this file only
 * knows how to find rows.
 */
export const searchRepo = {
  parties(companyId: number, query: string, limit = SEARCH_GROUP_LIMIT): SearchResult[] {
    const term = pattern(query)
    const rows = getDrizzle()
      .select({
        id: parties.id,
        name: parties.name,
        phone: parties.phone,
        gstin: parties.gstin,
        isCustomer: parties.is_customer,
        isSupplier: parties.is_supplier
      })
      .from(parties)
      .where(
        and(
          eq(parties.company_id, companyId),
          eq(parties.is_active, true),
          or(
            like(sql`lower(${parties.name})`, term),
            like(sql`lower(COALESCE(${parties.phone}, ''))`, term),
            like(sql`lower(COALESCE(${parties.gstin}, ''))`, term),
            like(sql`lower(COALESCE(${parties.email}, ''))`, term)
          )
        )
      )
      .orderBy(parties.name)
      .limit(limit)
      .all()

    return rows.map((row) => ({
      id: row.id,
      kind: 'PARTY' as const,
      title: row.name,
      subtitle: row.phone ?? row.gstin ?? null,
      meta: roleLabel(row.isCustomer, row.isSupplier)
    }))
  },

  items(companyId: number, query: string, limit = SEARCH_GROUP_LIMIT): SearchResult[] {
    const term = pattern(query)
    const rows = getDrizzle()
      .select({
        id: items.id,
        name: items.name,
        sku: items.sku,
        hsn: items.hsn_sac,
        gstRateBps: items.gst_rate_bps,
        isService: items.is_service
      })
      .from(items)
      .where(
        and(
          eq(items.company_id, companyId),
          eq(items.is_active, true),
          or(
            like(sql`lower(${items.name})`, term),
            like(sql`lower(COALESCE(${items.sku}, ''))`, term),
            like(sql`lower(COALESCE(${items.hsn_sac}, ''))`, term)
          )
        )
      )
      .orderBy(items.name)
      .limit(limit)
      .all()

    return rows.map((row) => ({
      id: row.id,
      kind: 'ITEM' as const,
      title: row.name,
      subtitle: [row.sku, row.hsn ? `HSN ${row.hsn}` : null, row.isService ? 'Service' : null]
        .filter(Boolean)
        .join(' · ') || null,
      meta: `${(row.gstRateBps / 100).toFixed(row.gstRateBps % 100 === 0 ? 0 : 2)}% GST`
    }))
  },

  vouchers(companyId: number, query: string, limit = SEARCH_GROUP_LIMIT): SearchResult[] {
    const term = pattern(query)
    const rows = getDrizzle()
      .select({
        id: vouchers.id,
        number: vouchers.number,
        type: vouchers.voucher_type,
        date: vouchers.voucher_date,
        status: vouchers.status,
        partyName: parties.name
      })
      .from(vouchers)
      .leftJoin(parties, eq(parties.id, vouchers.party_id))
      .where(
        and(
          eq(vouchers.company_id, companyId),
          eq(vouchers.status, 'POSTED'),
          or(
            like(sql`lower(${vouchers.number})`, term),
            like(sql`lower(COALESCE(${vouchers.reference_no}, ''))`, term),
            like(sql`lower(COALESCE(${vouchers.narration}, ''))`, term),
            like(sql`lower(COALESCE(${parties.name}, ''))`, term)
          )
        )
      )
      .orderBy(sql`${vouchers.voucher_date} DESC`, sql`${vouchers.id} DESC`)
      .limit(limit)
      .all()

    return rows.map((row) => ({
      id: row.id,
      kind: 'VOUCHER' as const,
      title: row.number,
      subtitle: [row.type, row.partyName].filter(Boolean).join(' · ') || null,
      meta: row.date
    }))
  },

  accounts(companyId: number, query: string, limit = SEARCH_GROUP_LIMIT): SearchResult[] {
    const term = pattern(query)
    const rows = getDrizzle()
      .select({
        id: accounts.id,
        name: accounts.name,
        groupName: accountGroups.name,
        systemKey: accounts.system_key
      })
      .from(accounts)
      .innerJoin(accountGroups, eq(accountGroups.id, accounts.group_id))
      .where(
        and(
          eq(accounts.company_id, companyId),
          eq(accounts.is_active, true),
          or(
            like(sql`lower(${accounts.name})`, term),
            like(sql`lower(${accountGroups.name})`, term),
            like(sql`lower(COALESCE(${accounts.system_key}, ''))`, term)
          )
        )
      )
      .orderBy(accountGroups.sort_order, accounts.name)
      .limit(limit)
      .all()

    return rows.map((row) => ({
      id: row.id,
      kind: 'ACCOUNT' as const,
      title: row.name,
      subtitle: row.groupName,
      meta: row.systemKey
    }))
  }
}

export const SEARCH_GROUP_LABELS: Record<SearchKind, string> = {
  PARTY: 'Parties',
  ITEM: 'Items',
  VOUCHER: 'Vouchers',
  ACCOUNT: 'Accounts'
}
