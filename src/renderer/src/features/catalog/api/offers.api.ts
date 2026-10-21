import type { OfferRow } from '../../../../../shared/contracts/catalog'
import { mapOfferInput } from '../mappers'
import type { OfferInput } from '../types'

/**
 * Offers IPC facade (wire shape). Returns the shared-contract `OfferRow`
 * exactly (`value_minor`, `min_purchase_minor`, ISO dates, `active`) — the
 * display mapping (money, `isActive`, `code`) happens in `mappers.ts`.
 */
export const offersApi = {
  listOffers(): Promise<OfferRow[]> {
    return window.api.catalog.listOffers()
  },

  getOffer(offerId: number): Promise<OfferRow> {
    return window.api.catalog.getOffer({ offerId })
  },

  createOffer(input: OfferInput): Promise<OfferRow> {
    return window.api.catalog.createOffer(mapOfferInput(input))
  },

  updateOffer(id: number, input: OfferInput): Promise<OfferRow> {
    return window.api.catalog.updateOffer({ offerId: id, ...mapOfferInput(input) })
  },

  deactivateOffer(id: number): Promise<void> {
    return window.api.catalog.deactivateOffer({ offerId: id })
  }
}
