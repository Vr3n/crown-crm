import type {
  SellMembershipInput,
  SellMembershipResult
} from '../../../../../shared/contracts/membership-sale'

export const membershipSaleApi = {
  sell: (input: SellMembershipInput): Promise<SellMembershipResult> =>
    window.api.memberships.sell(input)
}
