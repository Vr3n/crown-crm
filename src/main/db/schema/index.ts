import { defineRelations } from 'drizzle-orm'
import {
  appMeta,
  organizationStaff,
  organizations,
  permissions,
  rolePermissions,
  roles,
  users
} from './identity'
import {
  leadActivities,
  leadActivityTypes,
  leadFollowups,
  leadLostReasons,
  leadSources,
  leadStageHistory,
  leadStages,
  leads,
  people
} from './sales'
import {
  cancellationPolicies,
  freezePolicies,
  membershipPlanVersions,
  membershipPlans,
  offerRedemptions,
  offerVersions,
  offers,
  prorationPolicies
} from './catalog'
import { customers, memberships, membershipFreezes, membershipEvents } from './membership'
import { invoices, invoiceLines, invoiceSequence } from './billing'
import {
  paymentMethods,
  payments,
  paymentAllocations,
  refunds,
  credits,
  creditAllocations
} from './finance'
import { idempotencyKeys } from './idempotency'

export * from './identity'
export * from './sales'
export * from './catalog'
export * from './membership'
export * from './billing'
export * from './finance'
export * from './idempotency'

/**
 * The combined schema object passed to `drizzle()`. All tables from every module
 * are registered here.
 */
export const schema = {
  appMeta,
  cancellationPolicies,
  creditAllocations,
  credits,
  customers,
  freezePolicies,
  idempotencyKeys,
  invoiceLines,
  invoiceSequence,
  invoices,
  leadActivities,
  leadActivityTypes,
  leadFollowups,
  leadLostReasons,
  leadSources,
  leadStageHistory,
  leadStages,
  leads,
  membershipEvents,
  membershipFreezes,
  membershipPlanVersions,
  membershipPlans,
  memberships,
  offerRedemptions,
  offerVersions,
  offers,
  organizationStaff,
  organizations,
  paymentAllocations,
  paymentMethods,
  payments,
  people,
  permissions,
  prorationPolicies,
  refunds,
  rolePermissions,
  roles,
  users
}

/**
 * Relational config. Declared for schema completeness; repositories query with
 * explicit joins via the Drizzle select builder (never `db.query.*`), per the
 * ORM conventions.
 */
export const relations = defineRelations(schema, (helpers) => ({
  organizations: {
    roles: helpers.many.roles({
      from: helpers.organizations.id,
      to: helpers.roles.organization_id
    }),
    staff: helpers.many.organizationStaff({
      from: helpers.organizations.id,
      to: helpers.organizationStaff.organization_id
    })
  },
  users: {
    staff: helpers.many.organizationStaff({
      from: helpers.users.id,
      to: helpers.organizationStaff.user_id
    })
  },
  roles: {
    organization: helpers.one.organizations({
      from: helpers.roles.organization_id,
      to: helpers.organizations.id
    }),
    staff: helpers.many.organizationStaff({
      from: helpers.roles.id,
      to: helpers.organizationStaff.role_id
    }),
    permissions: helpers.many.rolePermissions({
      from: helpers.roles.id,
      to: helpers.rolePermissions.role_id
    })
  },
  permissions: {
    roles: helpers.many.rolePermissions({
      from: helpers.permissions.id,
      to: helpers.rolePermissions.permission_id
    })
  },
  rolePermissions: {
    role: helpers.one.roles({
      from: helpers.rolePermissions.role_id,
      to: helpers.roles.id
    }),
    permission: helpers.one.permissions({
      from: helpers.rolePermissions.permission_id,
      to: helpers.permissions.id
    })
  },
  organizationStaff: {
    organization: helpers.one.organizations({
      from: helpers.organizationStaff.organization_id,
      to: helpers.organizations.id
    }),
    user: helpers.one.users({
      from: helpers.organizationStaff.user_id,
      to: helpers.users.id
    }),
    role: helpers.one.roles({
      from: helpers.organizationStaff.role_id,
      to: helpers.roles.id
    })
  },
  people: {
    organization: helpers.one.organizations({
      from: helpers.people.organization_id,
      to: helpers.organizations.id
    }),
    leads: helpers.many.leads({
      from: helpers.people.id,
      to: helpers.leads.person_id
    })
  },
  leads: {
    organization: helpers.one.organizations({
      from: helpers.leads.organization_id,
      to: helpers.organizations.id
    }),
    person: helpers.one.people({
      from: helpers.leads.person_id,
      to: helpers.people.id
    }),
    source: helpers.one.leadSources({
      from: helpers.leads.source_id,
      to: helpers.leadSources.id
    }),
    currentStage: helpers.one.leadStages({
      from: helpers.leads.current_stage_id,
      to: helpers.leadStages.id
    }),
    owner: helpers.one.users({
      from: helpers.leads.owner_user_id,
      to: helpers.users.id
    }),
    plan: helpers.one.membershipPlans({
      from: helpers.leads.plan_id,
      to: helpers.membershipPlans.id
    }),
    activities: helpers.many.leadActivities({
      from: helpers.leads.id,
      to: helpers.leadActivities.lead_id
    }),
    followups: helpers.many.leadFollowups({
      from: helpers.leads.id,
      to: helpers.leadFollowups.lead_id
    }),
    stageHistory: helpers.many.leadStageHistory({
      from: helpers.leads.id,
      to: helpers.leadStageHistory.lead_id
    })
  },
  leadStages: {
    organization: helpers.one.organizations({
      from: helpers.leadStages.organization_id,
      to: helpers.organizations.id
    })
  },
  membershipPlans: {
    organization: helpers.one.organizations({
      from: helpers.membershipPlans.organization_id,
      to: helpers.organizations.id
    }),
    leads: helpers.many.leads({
      from: helpers.membershipPlans.id,
      to: helpers.leads.plan_id
    }),
    versions: helpers.many.membershipPlanVersions({
      from: helpers.membershipPlans.id,
      to: helpers.membershipPlanVersions.plan_id
    }),
    freezePolicy: helpers.one.freezePolicies({
      from: helpers.membershipPlans.freeze_policy_id,
      to: helpers.freezePolicies.id
    }),
    prorationPolicy: helpers.one.prorationPolicies({
      from: helpers.membershipPlans.proration_policy_id,
      to: helpers.prorationPolicies.id
    }),
    cancellationPolicy: helpers.one.cancellationPolicies({
      from: helpers.membershipPlans.cancellation_policy_id,
      to: helpers.cancellationPolicies.id
    })
  },
  membershipPlanVersions: {
    organization: helpers.one.organizations({
      from: helpers.membershipPlanVersions.organization_id,
      to: helpers.organizations.id
    }),
    plan: helpers.one.membershipPlans({
      from: helpers.membershipPlanVersions.plan_id,
      to: helpers.membershipPlans.id
    })
  },
  offers: {
    organization: helpers.one.organizations({
      from: helpers.offers.organization_id,
      to: helpers.organizations.id
    }),
    redemptions: helpers.many.offerRedemptions({
      from: helpers.offers.id,
      to: helpers.offerRedemptions.offer_id
    })
  },
  offerRedemptions: {
    organization: helpers.one.organizations({
      from: helpers.offerRedemptions.organization_id,
      to: helpers.organizations.id
    }),
    offer: helpers.one.offers({
      from: helpers.offerRedemptions.offer_id,
      to: helpers.offers.id
    }),
    createdBy: helpers.one.users({
      from: helpers.offerRedemptions.created_by,
      to: helpers.users.id
    })
  },
  freezePolicies: {
    organization: helpers.one.organizations({
      from: helpers.freezePolicies.organization_id,
      to: helpers.organizations.id
    }),
    plans: helpers.many.membershipPlans({
      from: helpers.freezePolicies.id,
      to: helpers.membershipPlans.freeze_policy_id
    })
  },
  prorationPolicies: {
    organization: helpers.one.organizations({
      from: helpers.prorationPolicies.organization_id,
      to: helpers.organizations.id
    }),
    plans: helpers.many.membershipPlans({
      from: helpers.prorationPolicies.id,
      to: helpers.membershipPlans.proration_policy_id
    })
  },
  cancellationPolicies: {
    organization: helpers.one.organizations({
      from: helpers.cancellationPolicies.organization_id,
      to: helpers.organizations.id
    }),
    plans: helpers.many.membershipPlans({
      from: helpers.cancellationPolicies.id,
      to: helpers.membershipPlans.cancellation_policy_id
    })
  },
  leadSources: {
    organization: helpers.one.organizations({
      from: helpers.leadSources.organization_id,
      to: helpers.organizations.id
    })
  },
  leadLostReasons: {
    organization: helpers.one.organizations({
      from: helpers.leadLostReasons.organization_id,
      to: helpers.organizations.id
    })
  },
  leadActivityTypes: {
    organization: helpers.one.organizations({
      from: helpers.leadActivityTypes.organization_id,
      to: helpers.organizations.id
    })
  },
  leadActivities: {
    lead: helpers.one.leads({
      from: helpers.leadActivities.lead_id,
      to: helpers.leads.id
    }),
    type: helpers.one.leadActivityTypes({
      from: helpers.leadActivities.type_id,
      to: helpers.leadActivityTypes.id
    }),
    createdBy: helpers.one.users({
      from: helpers.leadActivities.created_by,
      to: helpers.users.id
    })
  },
  leadFollowups: {
    lead: helpers.one.leads({
      from: helpers.leadFollowups.lead_id,
      to: helpers.leads.id
    }),
    createdBy: helpers.one.users({
      from: helpers.leadFollowups.created_by,
      to: helpers.users.id
    })
  },
  leadStageHistory: {
    lead: helpers.one.leads({
      from: helpers.leadStageHistory.lead_id,
      to: helpers.leads.id
    }),
    fromStage: helpers.one.leadStages({
      from: helpers.leadStageHistory.from_stage_id,
      to: helpers.leadStages.id
    }),
    toStage: helpers.one.leadStages({
      from: helpers.leadStageHistory.to_stage_id,
      to: helpers.leadStages.id
    }),
    activity: helpers.one.leadActivities({
      from: helpers.leadStageHistory.activity_id,
      to: helpers.leadActivities.id
    }),
    changedBy: helpers.one.users({
      from: helpers.leadStageHistory.changed_by,
      to: helpers.users.id
    })
  },
  customers: {
    organization: helpers.one.organizations({
      from: helpers.customers.organization_id,
      to: helpers.organizations.id
    }),
    person: helpers.one.people({
      from: helpers.customers.person_id,
      to: helpers.people.id
    }),
    memberships: helpers.many.memberships({
      from: helpers.customers.id,
      to: helpers.memberships.customer_id
    })
  },
  memberships: {
    organization: helpers.one.organizations({
      from: helpers.memberships.organization_id,
      to: helpers.organizations.id
    }),
    customer: helpers.one.customers({
      from: helpers.memberships.customer_id,
      to: helpers.customers.id
    }),
    plan: helpers.one.membershipPlans({
      from: helpers.memberships.plan_id,
      to: helpers.membershipPlans.id
    }),
    offer: helpers.one.offers({
      from: helpers.memberships.offer_id,
      to: helpers.offers.id
    }),
    freezes: helpers.many.membershipFreezes({
      from: helpers.memberships.id,
      to: helpers.membershipFreezes.membership_id
    }),
    events: helpers.many.membershipEvents({
      from: helpers.memberships.id,
      to: helpers.membershipEvents.membership_id
    })
  },
  membershipFreezes: {
    membership: helpers.one.memberships({
      from: helpers.membershipFreezes.membership_id,
      to: helpers.memberships.id
    }),
    createdBy: helpers.one.users({
      from: helpers.membershipFreezes.created_by,
      to: helpers.users.id
    })
  },
  membershipEvents: {
    membership: helpers.one.memberships({
      from: helpers.membershipEvents.membership_id,
      to: helpers.memberships.id
    }),
    createdBy: helpers.one.users({
      from: helpers.membershipEvents.created_by,
      to: helpers.users.id
    })
  },
  invoices: {
    organization: helpers.one.organizations({
      from: helpers.invoices.organization_id,
      to: helpers.organizations.id
    }),
    customer: helpers.one.customers({
      from: helpers.invoices.customer_id,
      to: helpers.customers.id
    }),
    lines: helpers.many.invoiceLines({
      from: helpers.invoices.id,
      to: helpers.invoiceLines.invoice_id
    })
  },
  invoiceLines: {
    invoice: helpers.one.invoices({
      from: helpers.invoiceLines.invoice_id,
      to: helpers.invoices.id
    }),
    plan: helpers.one.membershipPlans({
      from: helpers.invoiceLines.plan_id,
      to: helpers.membershipPlans.id
    }),
    offer: helpers.one.offers({
      from: helpers.invoiceLines.offer_id,
      to: helpers.offers.id
    })
  },
  payments: {
    organization: helpers.one.organizations({
      from: helpers.payments.organization_id,
      to: helpers.organizations.id
    }),
    customer: helpers.one.customers({
      from: helpers.payments.customer_id,
      to: helpers.customers.id
    }),
    allocations: helpers.many.paymentAllocations({
      from: helpers.payments.id,
      to: helpers.paymentAllocations.payment_id
    }),
    refunds: helpers.many.refunds({
      from: helpers.payments.id,
      to: helpers.refunds.payment_id
    })
  },
  paymentAllocations: {
    payment: helpers.one.payments({
      from: helpers.paymentAllocations.payment_id,
      to: helpers.payments.id
    }),
    invoice: helpers.one.invoices({
      from: helpers.paymentAllocations.invoice_id,
      to: helpers.invoices.id
    })
  },
  refunds: {
    payment: helpers.one.payments({
      from: helpers.refunds.payment_id,
      to: helpers.payments.id
    })
  },
  credits: {
    organization: helpers.one.organizations({
      from: helpers.credits.organization_id,
      to: helpers.organizations.id
    }),
    customer: helpers.one.customers({
      from: helpers.credits.customer_id,
      to: helpers.customers.id
    }),
    allocations: helpers.many.creditAllocations({
      from: helpers.credits.id,
      to: helpers.creditAllocations.credit_id
    })
  },
  creditAllocations: {
    credit: helpers.one.credits({
      from: helpers.creditAllocations.credit_id,
      to: helpers.credits.id
    }),
    invoice: helpers.one.invoices({
      from: helpers.creditAllocations.invoice_id,
      to: helpers.invoices.id
    })
  }
}))
