import {
  createCancellationPolicy,
  createFreezePolicy,
  createOffer,
  createPlan,
  createProrationPolicy,
  deactivateOffer,
  deletePlan,
  getAvailablePlans,
  getOffer,
  listOfferVersions,
  listOffers,
  listPlanVersions,
  listPlans,
  listPolicyLookups,
  updateCancellationPolicy,
  updateFreezePolicy,
  updateOffer,
  updatePlan,
  updateProrationPolicy
} from '../application/catalog'
import {
  createCancellationPolicyInputSchema,
  createFreezePolicyInputSchema,
  createOfferInputSchema,
  createPlanInputSchema,
  offerIdRequestSchema,
  offerVersionListRequestSchema,
  planIdRequestSchema,
  planVersionListRequestSchema,
  updateCancellationPolicyInputSchema,
  updateFreezePolicyInputSchema,
  updateOfferInputSchema,
  updatePlanInputSchema,
  updateProrationPolicyInputSchema,
  createProrationPolicyInputSchema
} from '../../shared/contracts/catalog'
import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import { handle } from './handle'

export function registerCatalogIpc(): void {
  handle(IPC_CHANNELS.CATALOG_LIST_PLANS, () => listPlans())
  handle(IPC_CHANNELS.CATALOG_LIST_AVAILABLE_PLANS, () => getAvailablePlans())
  handle(IPC_CHANNELS.CATALOG_CREATE_PLAN, createPlanInputSchema, (input) => createPlan(input))
  handle(IPC_CHANNELS.CATALOG_UPDATE_PLAN, updatePlanInputSchema, (input) => updatePlan(input))
  handle(IPC_CHANNELS.CATALOG_DELETE_PLAN, planIdRequestSchema, (input) => deletePlan(input))

  handle(IPC_CHANNELS.CATALOG_LIST_OFFERS, () => listOffers())
  handle(IPC_CHANNELS.CATALOG_GET_OFFER, offerIdRequestSchema, (input) => getOffer(input))
  handle(IPC_CHANNELS.CATALOG_CREATE_OFFER, createOfferInputSchema, (input) => createOffer(input))
  handle(IPC_CHANNELS.CATALOG_UPDATE_OFFER, updateOfferInputSchema, (input) => updateOffer(input))
  handle(IPC_CHANNELS.CATALOG_DEACTIVATE_OFFER, offerIdRequestSchema, (input) =>
    deactivateOffer(input)
  )
  handle(IPC_CHANNELS.CATALOG_LIST_PLAN_VERSIONS, planVersionListRequestSchema, (input) =>
    listPlanVersions(input)
  )
  handle(IPC_CHANNELS.CATALOG_LIST_OFFER_VERSIONS, offerVersionListRequestSchema, (input) =>
    listOfferVersions(input)
  )
  handle(IPC_CHANNELS.CATALOG_LIST_POLICY_LOOKUPS, () => listPolicyLookups())
  handle(IPC_CHANNELS.CATALOG_CREATE_FREEZE_POLICY, createFreezePolicyInputSchema, (input) =>
    createFreezePolicy(input)
  )
  handle(IPC_CHANNELS.CATALOG_UPDATE_FREEZE_POLICY, updateFreezePolicyInputSchema, (input) =>
    updateFreezePolicy(input)
  )
  handle(IPC_CHANNELS.CATALOG_CREATE_PRORATION_POLICY, createProrationPolicyInputSchema, (input) =>
    createProrationPolicy(input)
  )
  handle(IPC_CHANNELS.CATALOG_UPDATE_PRORATION_POLICY, updateProrationPolicyInputSchema, (input) =>
    updateProrationPolicy(input)
  )
  handle(
    IPC_CHANNELS.CATALOG_CREATE_CANCELLATION_POLICY,
    createCancellationPolicyInputSchema,
    (input) => createCancellationPolicy(input)
  )
  handle(
    IPC_CHANNELS.CATALOG_UPDATE_CANCELLATION_POLICY,
    updateCancellationPolicyInputSchema,
    (input) => updateCancellationPolicy(input)
  )
}
