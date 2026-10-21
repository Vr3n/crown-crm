import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import { organizations, users } from './identity'
import { customers, memberships } from './membership'
import { membershipPlans, offers } from './catalog'

/**
 * Billing & Invoicing schema (Module 04).
 *
 * Billing determines what the customer *owes*; Membership determines what they're
 * *entitled to*. A finalized invoice is immutable; a DRAFT gives the front desk a
 * live total before the numbers freeze.
 */
export const invoices = sqliteTable(
  'invoices',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    /** Business number, generated on finalize (Module 04 §36). Format: INV-YYMMDD-CUSTOMERID */
    number: text('number').notNull().unique(),
    customer_id: integer('customer_id')
      .notNull()
      .references(() => customers.id),
    /**
     * The membership this invoice bills. Set at sale/renew (membership ↔ one
     * invoice, created in the same transaction). Null for legacy invoices and
     * standalone/non-membership invoices — per-membership payment aggregation
     * keys off this.
     */
    membership_id: integer('membership_id').references(() => memberships.id),
    /** DRAFT / OPEN / PARTIALLY_PAID / PAID / VOID / UNCOLLECTIBLE */
    status: text('status').notNull().default('DRAFT'),
    /** Customer snapshot for the document (Module 02 §21, §4). */
    billing_name: text('billing_name'),
    billing_phone: text('billing_phone'),
    billing_email: text('billing_email'),
    billing_address: text('billing_address'),
    /** Totals (minor units, computed at finalize and never recomputed live). */
    subtotal_minor: integer('subtotal_minor').notNull().default(0),
    tax_minor: integer('tax_minor').notNull().default(0),
    total_minor: integer('total_minor').notNull().default(0),
    finalized_at: text('finalized_at'),
    finalized_by: integer('finalized_by').references(() => users.id),
    voided_at: text('voided_at'),
    voided_by: integer('voided_by').references(() => users.id),
    void_reason: text('void_reason'),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    created_by: integer('created_by')
      .notNull()
      .references(() => users.id)
  },
  (table) => [
    index('idx_invoices_org').on(table.organization_id),
    index('idx_invoices_org_status').on(table.organization_id, table.status),
    index('idx_invoices_customer').on(table.customer_id),
    index('idx_invoices_membership').on(table.organization_id, table.membership_id)
  ]
)

/**
 * Historical snapshot per line (Module 04 §14, §33). Never recompute from
 * plan/offer — the line's values are frozen at creation/finalization time.
 */
export const invoiceLines = sqliteTable(
  'invoice_lines',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    invoice_id: integer('invoice_id')
      .notNull()
      .references(() => invoices.id),
    description: text('description').notNull(),
    quantity: integer('quantity').notNull().default(1),
    unit_price_minor: integer('unit_price_minor').notNull(),
    discount_minor: integer('discount_minor').notNull().default(0),
    /** Tax rate in basis points (e.g. 1800 = 18.00%). Snapshotted at creation. */
    tax_rate_bps: integer('tax_rate_bps').notNull(),
    tax_amount_minor: integer('tax_amount_minor').notNull(),
    line_total_minor: integer('line_total_minor').notNull(),
    /** Reporting references (optional, never authoritative). */
    plan_id: integer('plan_id').references(() => membershipPlans.id),
    offer_id: integer('offer_id').references(() => offers.id),
    sort_order: integer('sort_order').notNull().default(0)
  },
  (table) => [
    index('idx_invoice_lines_invoice').on(table.invoice_id),
    index('idx_invoice_lines_org').on(table.organization_id)
  ]
)

/**
 * Atomic counter for invoice number generation. Uniqueness enforced by
 * UNIQUE (organization_id, year, prefix) + the invoices.number UNIQUE index;
 * a collision aborts the transaction (INVOICE_NUMBER_COLLISION).
 */
export const invoiceSequence = sqliteTable(
  'invoice_sequence',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    year: text('year').notNull(),
    prefix: text('prefix').notNull(),
    last_value: integer('last_value').notNull().default(0)
  },
  (table) => [unique().on(table.organization_id, table.year, table.prefix)]
)
