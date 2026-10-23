import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import { companies, users } from './identity'
import { accounts, godowns, items, parties } from './accounting'

/**
 * Documents. One voucher table serves every document type: sale, purchase,
 * receipt, payment, credit note, debit note, journal, contra, opening, stock
 * journal and physical stock. The type selects the posting rule.
 */

export const voucherSequences = sqliteTable(
  'voucher_sequences',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    company_id: integer('company_id')
      .notNull()
      .references(() => companies.id),
    voucher_type: text('voucher_type').notNull(),
    series: text('series').notNull(),
    fy: text('fy').notNull(),
    prefix: text('prefix').notNull().default(''),
    suffix: text('suffix').notNull().default(''),
    padding: integer('padding').notNull().default(4),
    last_value: integer('last_value').notNull().default(0)
  },
  (table) => [unique().on(table.company_id, table.voucher_type, table.series, table.fy)]
)

/**
 * Per company, per voucher type numbering defaults. The per financial year
 * counters stay in `voucher_sequences`; this table holds what the owner edits.
 */
export const voucherNumberSettings = sqliteTable(
  'voucher_number_settings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    company_id: integer('company_id')
      .notNull()
      .references(() => companies.id),
    voucher_type: text('voucher_type').notNull(),
    series: text('series').notNull(),
    prefix: text('prefix').notNull().default(''),
    suffix: text('suffix').notNull().default(''),
    padding: integer('padding').notNull().default(4),
    start_number: integer('start_number').notNull().default(1),
    reset_period: text('reset_period').notNull().default('YEARLY'),
    manual_override: integer('manual_override', { mode: 'boolean' }).notNull().default(false),
    updated_at: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [unique().on(table.company_id, table.voucher_type)]
)

export const vouchers = sqliteTable(
  'vouchers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    company_id: integer('company_id')
      .notNull()
      .references(() => companies.id),
    voucher_type: text('voucher_type').notNull(),
    series: text('series').notNull(),
    number: text('number').notNull(),
    fy: text('fy').notNull(),
    voucher_date: text('voucher_date').notNull(),
    due_date: text('due_date'),
    party_id: integer('party_id').references(() => parties.id),
    place_of_supply_state_code: text('place_of_supply_state_code'),
    narration: text('narration'),
    reference_no: text('reference_no'),
    /** DRAFT | POSTED | CANCELLED */
    status: text('status').notNull().default('DRAFT'),

    taxable_minor: integer('taxable_minor').notNull().default(0),
    cgst_minor: integer('cgst_minor').notNull().default(0),
    sgst_minor: integer('sgst_minor').notNull().default(0),
    igst_minor: integer('igst_minor').notNull().default(0),
    cess_minor: integer('cess_minor').notNull().default(0),
    discount_minor: integer('discount_minor').notNull().default(0),
    round_off_minor: integer('round_off_minor').notNull().default(0),
    total_minor: integer('total_minor').notNull().default(0),
    total_qty_e4: integer('total_qty_e4').notNull().default(0),

    payment_method_id: integer('payment_method_id'),
    instrument_no: text('instrument_no'),
    instrument_date: text('instrument_date'),
    bank_account_id: integer('bank_account_id').references(() => accounts.id),

    reversal_of_voucher_id: integer('reversal_of_voucher_id'),
    cancelled_at: text('cancelled_at'),
    cancelled_by: integer('cancelled_by').references(() => users.id),
    cancel_reason: text('cancel_reason'),

    idempotency_key: text('idempotency_key'),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    created_by: integer('created_by').references(() => users.id),
    posted_at: text('posted_at'),
    posted_by: integer('posted_by').references(() => users.id)
  },
  (table) => [
    unique().on(table.company_id, table.voucher_type, table.series, table.fy, table.number),
    index('idx_vouchers_company_date').on(table.company_id, table.voucher_date),
    index('idx_vouchers_company_type_status').on(
      table.company_id,
      table.voucher_type,
      table.status
    ),
    index('idx_vouchers_company_party').on(table.company_id, table.party_id, table.voucher_date),
    index('idx_vouchers_company_due').on(table.company_id, table.due_date)
  ]
)

export const voucherItemLines = sqliteTable(
  'voucher_item_lines',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    company_id: integer('company_id')
      .notNull()
      .references(() => companies.id),
    voucher_id: integer('voucher_id')
      .notNull()
      .references(() => vouchers.id, { onDelete: 'cascade' }),
    item_id: integer('item_id').references(() => items.id),
    description_snapshot: text('description_snapshot').notNull(),
    hsn_snapshot: text('hsn_snapshot'),
    uom_snapshot: text('uom_snapshot'),
    qty_e4: integer('qty_e4').notNull(),
    entered_rate_minor: integer('entered_rate_minor').notNull(),
    rate_includes_tax: integer('rate_includes_tax', { mode: 'boolean' }).notNull().default(false),
    discount_bps: integer('discount_bps').notNull().default(0),
    gst_rate_bps: integer('gst_rate_bps').notNull().default(0),
    taxable_value_minor: integer('taxable_value_minor').notNull().default(0),
    cgst_minor: integer('cgst_minor').notNull().default(0),
    sgst_minor: integer('sgst_minor').notNull().default(0),
    igst_minor: integer('igst_minor').notNull().default(0),
    cess_minor: integer('cess_minor').notNull().default(0),
    line_total_minor: integer('line_total_minor').notNull().default(0),
    unit_cost_minor: integer('unit_cost_minor'),
    godown_id: integer('godown_id').references(() => godowns.id),
    sort_order: integer('sort_order').notNull().default(0)
  },
  (table) => [
    index('idx_item_lines_voucher').on(table.voucher_id),
    check('item_lines_qty_positive', sql`${table.qty_e4} > 0`)
  ]
)

/** Exactly one side is filled. The pair check is the cheapest guard we have. */
export const ledgerLines = sqliteTable(
  'ledger_lines',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    company_id: integer('company_id')
      .notNull()
      .references(() => companies.id),
    voucher_id: integer('voucher_id')
      .notNull()
      .references(() => vouchers.id, { onDelete: 'cascade' }),
    account_id: integer('account_id')
      .notNull()
      .references(() => accounts.id),
    party_id: integer('party_id').references(() => parties.id),
    debit_minor: integer('debit_minor').notNull().default(0),
    credit_minor: integer('credit_minor').notNull().default(0),
    narration: text('narration'),
    sort_order: integer('sort_order').notNull().default(0)
  },
  (table) => [
    index('idx_ledger_company_account').on(table.company_id, table.account_id),
    index('idx_ledger_voucher').on(table.voucher_id),
    index('idx_ledger_company_party').on(table.company_id, table.party_id),
    check('ledger_one_side_only', sql`(${table.debit_minor} = 0) <> (${table.credit_minor} = 0)`),
    check('ledger_non_negative', sql`${table.debit_minor} >= 0 AND ${table.credit_minor} >= 0`)
  ]
)

/** Append only. Stock on hand is the sum, never a column. */
export const stockMovements = sqliteTable(
  'stock_movements',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    company_id: integer('company_id')
      .notNull()
      .references(() => companies.id),
    voucher_id: integer('voucher_id')
      .notNull()
      .references(() => vouchers.id, { onDelete: 'cascade' }),
    item_id: integer('item_id')
      .notNull()
      .references(() => items.id),
    godown_id: integer('godown_id').references(() => godowns.id),
    qty_in_e4: integer('qty_in_e4').notNull().default(0),
    qty_out_e4: integer('qty_out_e4').notNull().default(0),
    unit_cost_minor: integer('unit_cost_minor').notNull().default(0),
    /** OPENING | PURCHASE | SALE | RETURN_IN | RETURN_OUT | ADJUSTMENT | TRANSFER_IN | TRANSFER_OUT */
    movement_type: text('movement_type').notNull(),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    index('idx_stock_company_item').on(table.company_id, table.item_id, table.godown_id),
    index('idx_stock_voucher').on(table.voucher_id),
    check('stock_one_direction', sql`(${table.qty_in_e4} = 0) <> (${table.qty_out_e4} = 0)`)
  ]
)

/** The bridge that lets one payment settle many bills and vice versa. */
export const billAllocations = sqliteTable(
  'bill_allocations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    company_id: integer('company_id')
      .notNull()
      .references(() => companies.id),
    from_voucher_id: integer('from_voucher_id')
      .notNull()
      .references(() => vouchers.id),
    to_voucher_id: integer('to_voucher_id')
      .notNull()
      .references(() => vouchers.id),
    amount_minor: integer('amount_minor').notNull(),
    /** AGAINST_REF | ADVANCE | ON_ACCOUNT | OPENING */
    allocation_type: text('allocation_type').notNull(),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    created_by: integer('created_by').references(() => users.id)
  },
  (table) => [
    index('idx_allocations_from').on(table.from_voucher_id),
    index('idx_allocations_to').on(table.to_voucher_id),
    index('idx_allocations_company').on(table.company_id),
    check('allocation_positive', sql`${table.amount_minor} > 0`)
  ]
)
