import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { offersApi, offerVersionsApi, plansApi, policiesApi, versionsApi } from './api'
import {
  mapOfferRow,
  mapOfferVersionRow,
  mapPlanRow,
  mapPlanVersionRow,
  mapPolicyLookupSet
} from './mappers'
import type {
  Offer,
  OfferInput,
  OfferVersion,
  Plan,
  PlanInput,
  PlanVersion,
  PolicyLookups
} from './types'

/**
 * Catalog hooks. Query functions call the wire-shape api files and map to the
 * display types via `mappers.ts`; invalidation is feature-scoped (README
 * "Renderer API layer").
 */
export const catalogKeys = {
  all: ['catalog'] as const,
  plans: ['catalog', 'plans'] as const,
  planVersions: (planId: number) => ['catalog', 'plans', planId, 'versions'] as const,
  offers: ['catalog', 'offers'] as const,
  offerVersions: (offerId: number) => ['catalog', 'offers', offerId, 'versions'] as const,
  policyLookups: ['catalog', 'policy-lookups'] as const
}

export function usePlans(): UseQueryResult<Plan[], Error> {
  return useQuery({
    queryKey: catalogKeys.plans,
    queryFn: async () => (await plansApi.listPlans()).map(mapPlanRow)
  })
}

export function useAvailablePlans(): UseQueryResult<Plan[], Error> {
  return useQuery({
    queryKey: [...catalogKeys.plans, 'available'] as const,
    queryFn: async () => (await plansApi.listAvailablePlans()).map(mapPlanRow)
  })
}

export function useOffers(): UseQueryResult<Offer[], Error> {
  return useQuery({
    queryKey: catalogKeys.offers,
    queryFn: async () => (await offersApi.listOffers()).map(mapOfferRow)
  })
}

export function usePlanVersions(planId: number | null): UseQueryResult<PlanVersion[], Error> {
  return useQuery({
    queryKey: catalogKeys.planVersions(planId ?? 0),
    queryFn: async () =>
      (await versionsApi.listPlanVersions(planId as number)).map(mapPlanVersionRow),
    enabled: planId !== null
  })
}

export function useOfferVersions(offerId: number | null): UseQueryResult<OfferVersion[], Error> {
  return useQuery({
    queryKey: catalogKeys.offerVersions(offerId ?? 0),
    queryFn: async () =>
      (await offerVersionsApi.listOfferVersions(offerId as number)).map(mapOfferVersionRow),
    enabled: offerId !== null
  })
}

export function usePolicyLookups(): UseQueryResult<PolicyLookups, Error> {
  return useQuery({
    queryKey: catalogKeys.policyLookups,
    queryFn: async () => mapPolicyLookupSet(await policiesApi.listPolicyLookups())
  })
}

export function useCreatePlan(): UseMutationResult<Plan, Error, PlanInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: PlanInput) => mapPlanRow(await plansApi.createPlan(input)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: catalogKeys.plans })
      toast.success('Plan created', { description: 'The plan is now available at sale time.' })
    },
    onError: () => {
      toast.error('Could not create plan')
    }
  })
}

export function useUpdatePlan(): UseMutationResult<Plan, Error, { id: number; input: PlanInput }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id: number; input: PlanInput }) =>
      mapPlanRow(await plansApi.updatePlan(id, input)),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: catalogKeys.plans })
      void qc.invalidateQueries({ queryKey: catalogKeys.planVersions(id) })
      toast.success('Plan updated', {
        description: 'Existing memberships keep their snapshot price.'
      })
    },
    onError: () => {
      toast.error('Could not update plan')
    }
  })
}

export function useDeletePlan(): UseMutationResult<void, Error, number> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => plansApi.deletePlan(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: catalogKeys.plans })
      void qc.invalidateQueries({ queryKey: catalogKeys.offers })
      toast.success('Plan deleted')
    },
    onError: () => {
      toast.error('Could not delete plan')
    }
  })
}

export function useCreateOffer(): UseMutationResult<Offer, Error, OfferInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: OfferInput) => mapOfferRow(await offersApi.createOffer(input)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: catalogKeys.offers })
      toast.success('Offer created', {
        description: 'The offer is ready to be applied at sale time.'
      })
    },
    onError: () => {
      toast.error('Could not create offer')
    }
  })
}

export function useUpdateOffer(): UseMutationResult<
  Offer,
  Error,
  { id: number; input: OfferInput }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id: number; input: OfferInput }) =>
      mapOfferRow(await offersApi.updateOffer(id, input)),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: catalogKeys.offers })
      void qc.invalidateQueries({ queryKey: catalogKeys.offerVersions(id) })
      toast.success('Offer updated')
    },
    onError: () => {
      toast.error('Could not update offer')
    }
  })
}

export function useDeactivateOffer(): UseMutationResult<void, Error, number> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => offersApi.deactivateOffer(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: catalogKeys.offers })
      toast.success('Offer deactivated', { description: 'Historical redemptions are untouched.' })
    },
    onError: () => {
      toast.error('Could not deactivate offer')
    }
  })
}
