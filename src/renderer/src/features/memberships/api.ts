import type {
  CancelMembershipInput,
  CancelMembershipResult,
  RevertCancellationInput,
  RenewMembershipInput,
  RenewMembershipResult,
  MembershipRefundStateRequest,
  MembershipRefundState
} from '../../../../shared/contracts/membership-cancel-renew'

export const membershipApi = {
  cancel: (input: CancelMembershipInput): Promise<CancelMembershipResult> =>
    window.api.memberships.cancel(input),
  undoCancellation: (input: RevertCancellationInput): Promise<void> =>
    window.api.memberships.undoCancellation(input),
  renew: (input: RenewMembershipInput): Promise<RenewMembershipResult> =>
    window.api.memberships.renew(input),
  refundState: (input: MembershipRefundStateRequest): Promise<MembershipRefundState> =>
    window.api.memberships.refundState(input)
}
