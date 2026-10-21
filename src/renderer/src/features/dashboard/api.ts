import type {
  MembershipExpiration,
  PaymentDue,
  MemberRecord,
  MembershipInvoice,
  MembershipDetails
} from './types'
import type {
  PaymentDueOutput,
  MemberRecordOutput,
  MembershipInvoiceOutput,
  MembershipDetailsOutput
} from '../../../../shared/contracts/dashboard'

function mapPaymentDue(row: PaymentDueOutput): PaymentDue {
  return {
    id: row.id,
    member: row.member,
    plan: row.plan,
    purchasedAt: row.purchasedAt,
    amountDueMinor: row.amountDueMinor,
    totalMinor: row.totalMinor,
    invoiceNumber: row.invoiceNumber,
    planStartDate: row.planStartDate,
    planEndDate: row.planEndDate,
    joiningDate: row.joiningDate,
    membershipAmountMinor: row.membershipAmountMinor,
    membershipPurchasedAt: row.membershipPurchasedAt,
    customerId: row.customerId,
    membershipId: row.membershipId,
    renewPlanId: row.renewPlanId
  }
}

function mapMembershipInvoice(row: MembershipInvoiceOutput): MembershipInvoice {
  return {
    id: row.id,
    invoiceNo: row.invoiceNo,
    label: row.label,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    amountMinor: row.amountMinor,
    status: row.status,
    paidAt: row.paidAt
  }
}

function mapMembershipDetails(row: MembershipDetailsOutput): MembershipDetails {
  return {
    plan: row.plan,
    purchasedAt: row.purchasedAt,
    expiresAt: row.expiresAt,
    amountDueMinor: row.amountDueMinor,
    totalMinor: row.totalMinor
  }
}

function mapMemberRecord(row: MemberRecordOutput): MemberRecord {
  return {
    membership: mapMembershipDetails(row.membership),
    lead: row.lead,
    invoices: row.invoices.map(mapMembershipInvoice)
  }
}

/**
 * Thin IPC facade for the dashboard surface. Every method delegates to the
 * preload bridge (`window.api.dashboard.*`).
 */
export const api = {
  upcomingExpirations: (): Promise<MembershipExpiration[]> => window.api.dashboard.expirations(),
  paymentsDue: (): Promise<PaymentDue[]> =>
    window.api.dashboard.paymentsDue().then((rows) => rows.map(mapPaymentDue)),
  memberRecord: (id: string): Promise<MemberRecord | undefined> =>
    window.api.dashboard
      .memberRecord({ memberId: id })
      .then((row) => (row ? mapMemberRecord(row) : undefined)),
  paymentRecord: (id: string): Promise<MemberRecord | undefined> =>
    window.api.dashboard
      .paymentRecord({ memberId: id })
      .then((row) => (row ? mapMemberRecord(row) : undefined))
}
