import { and, eq } from 'drizzle-orm'
import { getDrizzle, withTransaction } from './connection'
import {
  accountGroups,
  accounts,
  godowns,
  paymentMethods,
  permissions,
  rolePermissions,
  roles,
  stockGroups,
  taxRates,
  units
} from './schema'
import { ALL_PERMISSION_CODES } from './permissions'

export interface SeedRole {
  name: string
  isSystem: boolean
  isSuper: boolean
  description: string
  permissions: string[]
}

/**
 * Starter roles, shipped as editable data. Owner and Admin are system roles and
 * super. The others are ordinary and changeable through RolePermission rows.
 */
export const SEED_ROLES: SeedRole[] = [
  {
    name: 'Owner',
    isSystem: true,
    isSuper: true,
    description: 'Full access to every part of the books',
    permissions: []
  },
  {
    name: 'Admin',
    isSystem: true,
    isSuper: true,
    description: 'Full access, including users and settings',
    permissions: []
  },
  {
    name: 'Accountant',
    isSystem: false,
    isSuper: false,
    description: 'Masters, vouchers, payments and reports',
    permissions: [
      'company.view',
      'party.view',
      'party.create',
      'party.edit',
      'party.deactivate',
      'item.view',
      'item.create',
      'item.edit',
      'item.deactivate',
      'voucher.view',
      'voucher.create',
      'voucher.post',
      'voucher.cancel',
      'receipt.view',
      'receipt.record',
      'payment.view',
      'payment.record',
      'note.view',
      'note.create',
      'journal.view',
      'journal.create',
      'report.view',
      'report.export',
      'user.view',
      'role.view',
      'backup.manage'
    ]
  },
  {
    name: 'Billing Clerk',
    isSystem: false,
    isSuper: false,
    description: 'Raises bills and records receipts',
    permissions: [
      'party.view',
      'party.create',
      'item.view',
      'voucher.view',
      'voucher.create',
      'voucher.post',
      'receipt.view',
      'receipt.record',
      'report.view'
    ]
  },
  {
    name: 'Auditor',
    isSystem: false,
    isSuper: false,
    description: 'Read only access to books and reports',
    permissions: [
      'company.view',
      'party.view',
      'item.view',
      'voucher.view',
      'receipt.view',
      'payment.view',
      'note.view',
      'journal.view',
      'report.view',
      'report.export',
      'user.view',
      'role.view'
    ]
  }
]

/** Inserts any permission code missing from the catalog table. Idempotent. */
export function seedPermissions(): void {
  const db = getDrizzle()
  const existing = new Set(
    db
      .select({ code: permissions.code })
      .from(permissions)
      .all()
      .map((r) => r.code)
  )
  for (const code of ALL_PERMISSION_CODES) {
    if (existing.has(code)) continue
    db.insert(permissions).values({ code }).run()
  }
}

/** Creates the starter roles for a company and grants their permissions. */
export function seedRolesForCompany(companyId: number): void {
  const db = getDrizzle()
  for (const role of SEED_ROLES) {
    const existing = db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.company_id, companyId), eq(roles.name, role.name)))
      .get()

    const roleId =
      existing?.id ??
      db
        .insert(roles)
        .values({
          company_id: companyId,
          name: role.name,
          is_system_role: role.isSystem,
          is_super: role.isSuper,
          description: role.description
        })
        .returning({ id: roles.id })
        .get().id

    if (role.isSuper) continue
    for (const code of role.permissions) {
      const permission = db
        .select({ id: permissions.id })
        .from(permissions)
        .where(eq(permissions.code, code))
        .get()
      if (!permission) continue
      db.insert(rolePermissions)
        .values({ role_id: roleId, permission_id: permission.id })
        .onConflictDoNothing()
        .run()
    }
  }
}

const UNIT_SEED: { name: string; symbol: string; decimals: number }[] = [
  { name: 'Nos', symbol: 'nos', decimals: 0 },
  { name: 'Pcs', symbol: 'pcs', decimals: 0 },
  { name: 'Kg', symbol: 'kg', decimals: 3 },
  { name: 'Gm', symbol: 'gm', decimals: 0 },
  { name: 'Ltr', symbol: 'ltr', decimals: 3 },
  { name: 'Ml', symbol: 'ml', decimals: 0 },
  { name: 'Mtr', symbol: 'mtr', decimals: 3 },
  { name: 'Box', symbol: 'box', decimals: 0 },
  { name: 'Pack', symbol: 'pack', decimals: 0 },
  { name: 'Set', symbol: 'set', decimals: 0 },
  { name: 'Hrs', symbol: 'hrs', decimals: 2 }
]

const GROUP_SEED: { name: string; nature: string; sort: number }[] = [
  { name: 'Capital Account', nature: 'EQUITY', sort: 10 },
  { name: 'Loans', nature: 'LIABILITY', sort: 20 },
  { name: 'Current Liabilities', nature: 'LIABILITY', sort: 30 },
  { name: 'Sundry Creditors', nature: 'LIABILITY', sort: 40 },
  { name: 'Duties and Taxes', nature: 'LIABILITY', sort: 50 },
  { name: 'Current Assets', nature: 'ASSET', sort: 60 },
  { name: 'Cash in Hand', nature: 'ASSET', sort: 70 },
  { name: 'Bank Accounts', nature: 'ASSET', sort: 80 },
  { name: 'Sundry Debtors', nature: 'ASSET', sort: 90 },
  { name: 'Stock in Hand', nature: 'ASSET', sort: 100 },
  { name: 'Fixed Assets', nature: 'ASSET', sort: 110 },
  { name: 'Sales', nature: 'INCOME', sort: 120 },
  { name: 'Sales Returns', nature: 'INCOME', sort: 130 },
  { name: 'Direct Incomes', nature: 'INCOME', sort: 140 },
  { name: 'Indirect Incomes', nature: 'INCOME', sort: 150 },
  { name: 'Purchases', nature: 'EXPENSE', sort: 160 },
  { name: 'Purchase Returns', nature: 'EXPENSE', sort: 170 },
  { name: 'Direct Expenses', nature: 'EXPENSE', sort: 180 },
  { name: 'Indirect Expenses', nature: 'EXPENSE', sort: 190 }
]

const ACCOUNT_SEED: {
  group: string
  name: string
  type: string
  systemKey: string | null
}[] = [
  { group: 'Cash in Hand', name: 'Cash', type: 'ASSET', systemKey: 'CASH' },
  { group: 'Bank Accounts', name: 'Bank', type: 'ASSET', systemKey: 'BANK' },
  { group: 'Sales', name: 'Sales', type: 'INCOME', systemKey: 'SALES' },
  { group: 'Sales Returns', name: 'Sales Returns', type: 'INCOME', systemKey: 'SALES_RETURNS' },
  { group: 'Purchases', name: 'Purchases', type: 'EXPENSE', systemKey: 'PURCHASES' },
  {
    group: 'Purchase Returns',
    name: 'Purchase Returns',
    type: 'EXPENSE',
    systemKey: 'PURCHASE_RETURNS'
  },
  { group: 'Duties and Taxes', name: 'Output CGST', type: 'LIABILITY', systemKey: 'OUTPUT_CGST' },
  { group: 'Duties and Taxes', name: 'Output SGST', type: 'LIABILITY', systemKey: 'OUTPUT_SGST' },
  { group: 'Duties and Taxes', name: 'Output IGST', type: 'LIABILITY', systemKey: 'OUTPUT_IGST' },
  { group: 'Duties and Taxes', name: 'Input CGST', type: 'ASSET', systemKey: 'INPUT_CGST' },
  { group: 'Duties and Taxes', name: 'Input SGST', type: 'ASSET', systemKey: 'INPUT_SGST' },
  { group: 'Duties and Taxes', name: 'Input IGST', type: 'ASSET', systemKey: 'INPUT_IGST' },
  { group: 'Indirect Expenses', name: 'Round Off', type: 'EXPENSE', systemKey: 'ROUND_OFF' },
  {
    group: 'Direct Expenses',
    name: 'Cost of Goods Sold',
    type: 'EXPENSE',
    systemKey: 'COGS'
  },
  { group: 'Stock in Hand', name: 'Inventory', type: 'ASSET', systemKey: 'INVENTORY' },
  {
    group: 'Indirect Expenses',
    name: 'Stock Adjustment',
    type: 'EXPENSE',
    systemKey: 'STOCK_ADJUSTMENT'
  },
  {
    group: 'Capital Account',
    name: 'Opening Balance Difference',
    type: 'EQUITY',
    systemKey: 'OPENING_DIFF'
  },
  {
    group: 'Indirect Expenses',
    name: 'Discount Given',
    type: 'EXPENSE',
    systemKey: 'DISCOUNT_GIVEN'
  },
  {
    group: 'Indirect Incomes',
    name: 'Discount Received',
    type: 'INCOME',
    systemKey: 'DISCOUNT_RECEIVED'
  }
]

const TAX_RATES = [0, 5, 12, 18, 28]

const PAYMENT_METHOD_SEED = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Cheque', 'NEFT', 'RTGS']

/**
 * Seeds the reference data a company needs before its first voucher: chart of
 * accounts, units, tax rates, payment methods, one godown and number series.
 * Idempotent, so it is safe to run on an existing company during upgrade.
 */
export function seedCompanyDefaults(companyId: number, booksBeginDate: string): void {
  withTransaction(() => {
    const db = getDrizzle()

    for (const unit of UNIT_SEED) {
      db.insert(units)
        .values({
          company_id: companyId,
          name: unit.name,
          symbol: unit.symbol,
          decimals: unit.decimals,
          is_system: true
        })
        .onConflictDoNothing()
        .run()
    }

    for (const group of GROUP_SEED) {
      db.insert(accountGroups)
        .values({
          company_id: companyId,
          name: group.name,
          nature: group.nature,
          sort_order: group.sort,
          is_system: true
        })
        .onConflictDoNothing()
        .run()
    }

    const groupRows = db
      .select({ id: accountGroups.id, name: accountGroups.name })
      .from(accountGroups)
      .where(eq(accountGroups.company_id, companyId))
      .all()
    const groupId = new Map(groupRows.map((g) => [g.name, g.id]))

    for (const account of ACCOUNT_SEED) {
      const group = groupId.get(account.group)
      if (!group) continue
      db.insert(accounts)
        .values({
          company_id: companyId,
          group_id: group,
          name: account.name,
          type: account.type,
          system_key: account.systemKey,
          is_system: account.systemKey !== null
        })
        .onConflictDoNothing()
        .run()
    }

    db.insert(stockGroups)
      .values({ company_id: companyId, name: 'General' })
      .onConflictDoNothing()
      .run()

    db.insert(godowns)
      .values({ company_id: companyId, name: 'Main Location' })
      .onConflictDoNothing()
      .run()

    const existingRates = db
      .select({ id: taxRates.id })
      .from(taxRates)
      .where(eq(taxRates.company_id, companyId))
      .all()
    if (existingRates.length === 0) {
      for (const rate of TAX_RATES) {
        db.insert(taxRates)
          .values({
            company_id: companyId,
            gst_rate_bps: rate * 100,
            cess_rate_bps: 0,
            description: rate === 0 ? 'Exempt' : `GST ${rate}%`,
            effective_from: booksBeginDate
          })
          .run()
      }
    }

    PAYMENT_METHOD_SEED.forEach((name, index) => {
      db.insert(paymentMethods)
        .values({ company_id: companyId, name, sort_order: index })
        .onConflictDoNothing()
        .run()
    })
  })
}
