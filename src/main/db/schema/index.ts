import { defineRelations } from 'drizzle-orm'
import {
  appMeta,
  companies,
  companyUsers,
  permissions,
  rolePermissions,
  roles,
  users
} from './identity'
import {
  accountGroups,
  accounts,
  godowns,
  items,
  partyAccounts,
  parties,
  stockGroups,
  taxRates,
  units
} from './accounting'
import {
  billAllocations,
  ledgerLines,
  stockMovements,
  voucherItemLines,
  voucherSequences,
  vouchers
} from './documents'
import { auditEvents, paymentMethods } from './operations'
import { idempotencyKeys } from './idempotency'

export * from './identity'
export * from './accounting'
export * from './documents'
export * from './operations'
export * from './idempotency'

export const schema = {
  appMeta,
  companies,
  companyUsers,
  permissions,
  rolePermissions,
  roles,
  users,
  accountGroups,
  accounts,
  godowns,
  items,
  partyAccounts,
  parties,
  stockGroups,
  taxRates,
  units,
  billAllocations,
  ledgerLines,
  stockMovements,
  voucherItemLines,
  voucherSequences,
  vouchers,
  auditEvents,
  paymentMethods,
  idempotencyKeys
}

/**
 * Relational config passed to `drizzle()`. Repositories query with explicit
 * joins; this exists so `db.query` remains usable for small reads.
 */
export const relations = defineRelations(schema, (helpers) => ({
  companies: {
    roles: helpers.many.roles({ from: helpers.companies.id, to: helpers.roles.company_id }),
    staff: helpers.many.companyUsers({
      from: helpers.companies.id,
      to: helpers.companyUsers.company_id
    }),
    parties: helpers.many.parties({ from: helpers.companies.id, to: helpers.parties.company_id }),
    items: helpers.many.items({ from: helpers.companies.id, to: helpers.items.company_id }),
    vouchers: helpers.many.vouchers({ from: helpers.companies.id, to: helpers.vouchers.company_id })
  },
  users: {
    staff: helpers.many.companyUsers({ from: helpers.users.id, to: helpers.companyUsers.user_id })
  },
  roles: {
    company: helpers.one.companies({ from: helpers.roles.company_id, to: helpers.companies.id }),
    permissions: helpers.many.rolePermissions({
      from: helpers.roles.id,
      to: helpers.rolePermissions.role_id
    })
  },
  rolePermissions: {
    role: helpers.one.roles({ from: helpers.rolePermissions.role_id, to: helpers.roles.id }),
    permission: helpers.one.permissions({
      from: helpers.rolePermissions.permission_id,
      to: helpers.permissions.id
    })
  },
  companyUsers: {
    company: helpers.one.companies({
      from: helpers.companyUsers.company_id,
      to: helpers.companies.id
    }),
    user: helpers.one.users({ from: helpers.companyUsers.user_id, to: helpers.users.id }),
    role: helpers.one.roles({ from: helpers.companyUsers.role_id, to: helpers.roles.id })
  },
  accounts: {
    company: helpers.one.companies({ from: helpers.accounts.company_id, to: helpers.companies.id }),
    group: helpers.one.accountGroups({
      from: helpers.accounts.group_id,
      to: helpers.accountGroups.id
    }),
    ledgerLines: helpers.many.ledgerLines({
      from: helpers.accounts.id,
      to: helpers.ledgerLines.account_id
    })
  },
  parties: {
    company: helpers.one.companies({ from: helpers.parties.company_id, to: helpers.companies.id }),
    accounts: helpers.many.partyAccounts({
      from: helpers.parties.id,
      to: helpers.partyAccounts.party_id
    }),
    vouchers: helpers.many.vouchers({ from: helpers.parties.id, to: helpers.vouchers.party_id })
  },
  partyAccounts: {
    party: helpers.one.parties({ from: helpers.partyAccounts.party_id, to: helpers.parties.id }),
    account: helpers.one.accounts({
      from: helpers.partyAccounts.account_id,
      to: helpers.accounts.id
    })
  },
  items: {
    company: helpers.one.companies({ from: helpers.items.company_id, to: helpers.companies.id }),
    unit: helpers.one.units({ from: helpers.items.uom_id, to: helpers.units.id }),
    stockGroup: helpers.one.stockGroups({
      from: helpers.items.stock_group_id,
      to: helpers.stockGroups.id
    }),
    stockMovements: helpers.many.stockMovements({
      from: helpers.items.id,
      to: helpers.stockMovements.item_id
    })
  },
  vouchers: {
    company: helpers.one.companies({ from: helpers.vouchers.company_id, to: helpers.companies.id }),
    party: helpers.one.parties({ from: helpers.vouchers.party_id, to: helpers.parties.id }),
    itemLines: helpers.many.voucherItemLines({
      from: helpers.vouchers.id,
      to: helpers.voucherItemLines.voucher_id
    }),
    ledgerLines: helpers.many.ledgerLines({
      from: helpers.vouchers.id,
      to: helpers.ledgerLines.voucher_id
    }),
    stockMovements: helpers.many.stockMovements({
      from: helpers.vouchers.id,
      to: helpers.stockMovements.voucher_id
    })
  },
  voucherItemLines: {
    voucher: helpers.one.vouchers({
      from: helpers.voucherItemLines.voucher_id,
      to: helpers.vouchers.id
    }),
    item: helpers.one.items({ from: helpers.voucherItemLines.item_id, to: helpers.items.id })
  },
  ledgerLines: {
    voucher: helpers.one.vouchers({
      from: helpers.ledgerLines.voucher_id,
      to: helpers.vouchers.id
    }),
    account: helpers.one.accounts({
      from: helpers.ledgerLines.account_id,
      to: helpers.accounts.id
    }),
    party: helpers.one.parties({ from: helpers.ledgerLines.party_id, to: helpers.parties.id })
  },
  stockMovements: {
    voucher: helpers.one.vouchers({
      from: helpers.stockMovements.voucher_id,
      to: helpers.vouchers.id
    }),
    item: helpers.one.items({ from: helpers.stockMovements.item_id, to: helpers.items.id }),
    godown: helpers.one.godowns({ from: helpers.stockMovements.godown_id, to: helpers.godowns.id })
  },
  billAllocations: {
    from: helpers.one.vouchers({
      from: helpers.billAllocations.from_voucher_id,
      to: helpers.vouchers.id
    }),
    to: helpers.one.vouchers({
      from: helpers.billAllocations.to_voucher_id,
      to: helpers.vouchers.id
    })
  },
  voucherSequences: {
    company: helpers.one.companies({
      from: helpers.voucherSequences.company_id,
      to: helpers.companies.id
    })
  },
  accountGroups: {
    company: helpers.one.companies({
      from: helpers.accountGroups.company_id,
      to: helpers.companies.id
    }),
    accounts: helpers.many.accounts({
      from: helpers.accountGroups.id,
      to: helpers.accounts.group_id
    })
  },
  units: {
    company: helpers.one.companies({ from: helpers.units.company_id, to: helpers.companies.id })
  },
  stockGroups: {
    company: helpers.one.companies({
      from: helpers.stockGroups.company_id,
      to: helpers.companies.id
    })
  },
  godowns: {
    company: helpers.one.companies({ from: helpers.godowns.company_id, to: helpers.companies.id })
  },
  taxRates: {
    company: helpers.one.companies({ from: helpers.taxRates.company_id, to: helpers.companies.id })
  },
  paymentMethods: {
    company: helpers.one.companies({
      from: helpers.paymentMethods.company_id,
      to: helpers.companies.id
    })
  },
  auditEvents: {
    company: helpers.one.companies({
      from: helpers.auditEvents.company_id,
      to: helpers.companies.id
    }),
    actor: helpers.one.users({ from: helpers.auditEvents.actor_user_id, to: helpers.users.id })
  },
  idempotencyKeys: {
    company: helpers.one.companies({
      from: helpers.idempotencyKeys.company_id,
      to: helpers.companies.id
    })
  }
}))
