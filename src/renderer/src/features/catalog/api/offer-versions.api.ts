import type { OfferVersionRow } from '../../../../../shared/contracts/catalog'

/**
 * Offer-version IPC facade (wire shape). Reads an offer's discount history,
 * oldest first — surfaced on the Offers page after an edit.
 */
export const offerVersionsApi = {
  listOfferVersions(offerId: number): Promise<OfferVersionRow[]> {
    return window.api.catalog.listOfferVersions({ offerId })
  }
}
