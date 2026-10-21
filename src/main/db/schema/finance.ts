import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import { organizations, users } from './identity'
import { customers } from './membership'
import { invoices } from './billing'

/**
 * Finance schema (Module 05).
 *
 * Operational finance, not double-entry accounting (Module 05 §20). Three separate
 * concepts: Payment (money arrived), Invoice (money owed), PaymentAllocation
 * (which part of which payment covers which invoice). Refunds and Credits are
 * distinct, both immutable additions layered on top of the original payment.
 */

/** Reference table for payment methods, seeded per org. */
export const paymentMethods = sqliteTable(
  'payment_methods',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    sort_order: integer('sort_order').notNull().default(0),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    unique().on(table.organization_id, table.name),
    index('idx_payment_methods_org').on(table.organization_id)
  ]
)

/**
 * A payment is a staff-recorded fact, not a machine-verified gateway event.
 * Never edited or deleted (Module 05 §15, §20).
 */
export const payments = sqliteTable(
  'payments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    customer_id: integer('customer_id')
      .notNull()
      .references(() => customers.id),
    payment_date: text('payment_date').notNull(),
    amount_minor: integer('amount_minor').notNull(),
    /** CASH / UPI / CARD / BANK_TRANSFER / CHEQUE / OTHER (configurable via reference table). */
    payment_method: text('payment_method').notNull(),
    reference: text('reference'),
    notes: text('notes'),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    created_by: integer('created_by')
      .notNull()
      .references(() => users.id)
  },
  (table) => [
    index('idx_payments_org').on(table.organization_id),
    index('idx_payments_org_date').on(table.organization_id, table.payment_date),
    index('idx_payments_customer').on(table.customer_id),
    check('payments_amount_positive', sql`${table.amount_minor} > 0`)
  ]
)

/**
 * Links a payment to one or more invoices. Payment 1 ── * PaymentAllocation * ── 1 Invoice.
 * Invariant: allocated total per payment ≤ payment amount (PAYMENT_OVER_ALLOCATED);
 * allocation per invoice ≤ invoice outstanding.
 *
 * Allocations are immutable; correcting one is a reversal + new allocation.
 */
export const paymentAllocations = sqliteTable(
  'payment_allocations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    payment_id: integer('payment_id')
      .notNull()
      .references(() => payments.id),
    invoice_id: integer('invoice_id')
      .notNull()
      .references(() => invoices.id),
    amount_minor: integer('amount_minor').notNull(),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    created_by: integer('created_by')
      .notNull()
      .references(() => users.id)
  },
  (table) => [
    index('idx_allocations_payment').on(table.payment_id),
    index('idx_allocations_invoice').on(table.invoice_id),
    index('idx_allocations_org').on(table.organization_id),
    check('allocations_amount_positive', sql`${table.amount_minor} > 0`)
  ]
)

/**
 * A refund never edits the payment (Module 05 §17, Scenario 5).
 * Invariant: refunded total per payment ≤ paid total (REFUND_EXCEEDS_PAYMENT).
 * A refund "reverses" allocation coverage: it decreases the *net allocated*
 * toward the invoice, which may flip invoice state back toward OPEN.
 */
export const refunds = sqliteTable(
  'refunds',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    payment_id: integer('payment_id')
      .notNull()
      .references(() => payments.id),
    amount_minor: integer('amount_minor').notNull(),
    reason: text('reason').notNull(),
    /**
     * ISSUED — money left; affects refundable + invoice status.
     * SCHEDULED — pending until `scheduled_date` (cancellation effective date).
     * VOIDED — scheduled then cancelled (reverted cancellation); audit trail only.
     */
    status: text('status').notNull().default('ISSUED'),
    scheduled_date: text('scheduled_date'),
    issued_at: text('issued_at'),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    created_by: integer('created_by')
      .notNull()
      .references(() => users.id)
  },
  (table) => [
    index('idx_refunds_payment').on(table.payment_id),
    index('idx_refunds_org').on(table.organization_id),
    index('idx_refunds_status').on(table.status)
  ]
)

/**
 * A credit stays inside the business as value against a future obligation
 * (Module 05 §18). `remaining_minor` is maintained by the application layer
 * in the same transaction as the credit allocation.
 */
export const credits = sqliteTable(
  'credits',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    customer_id: integer('customer_id')
      .notNull()
      .references(() => customers.id),
    amount_minor: integer('amount_minor').notNull(),
    remaining_minor: integer('remaining_minor').notNull(),
    reason: text('reason').notNull(),
    expires_at: text('expires_at'),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    created_by: integer('created_by')
      .notNull()
      .references(() => users.id)
  },
  (table) => [
    index('idx_credits_org').on(table.organization_id),
    index('idx_credits_customer').on(table.customer_id)
  ]
)

/** Links a credit to an invoice. Invariant: applied total per credit ≤ credit amount. */
export const creditAllocations = sqliteTable(
  'credit_allocations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    credit_id: integer('credit_id')
      .notNull()
      .references(() => credits.id),
    invoice_id: integer('invoice_id')
      .notNull()
      .references(() => invoices.id),
    amount_minor: integer('amount_minor').notNull(),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    created_by: integer('created_by')
      .notNull()
      .references(() => users.id)
  },
  (table) => [
    index('idx_credit_allocations_credit').on(table.credit_id),
    index('idx_credit_allocations_invoice').on(table.invoice_id),
    index('idx_credit_allocations_org').on(table.organization_id),
    check('credit_alloc_amount_positive', sql`${table.amount_minor} > 0`)
  ]
)
