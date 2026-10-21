import {
  cancelMembership,
  revertCancellationRequest,
  renewMembership,
  getMembershipRefundState,
  sellMembership
} from '../application/memberships'
import { sellMembershipInputSchema } from '../../shared/contracts/membership-sale'
import {
  cancelMembershipInputSchema,
  revertCancellationInputSchema,
  renewMembershipInputSchema,
  membershipRefundStateRequestSchema
} from '../../shared/contracts/membership-cancel-renew'
import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import { handle } from './handle'

export function registerMembershipsIpc(): void {
  handle(IPC_CHANNELS.MEMBERSHIPS_SELL, sellMembershipInputSchema, (input) => sellMembership(input))
  handle(IPC_CHANNELS.MEMBERSHIPS_CANCEL, cancelMembershipInputSchema, (input) =>
    cancelMembership(input)
  )
  handle(IPC_CHANNELS.MEMBERSHIPS_UNDO_CANCELLATION, revertCancellationInputSchema, (input) =>
    revertCancellationRequest(input)
  )
  handle(IPC_CHANNELS.MEMBERSHIPS_RENEW, renewMembershipInputSchema, (input) =>
    renewMembership(input)
  )
  handle(IPC_CHANNELS.MEMBERSHIPS_REFUND_STATE, membershipRefundStateRequestSchema, (input) =>
    getMembershipRefundState(input)
  )
}
