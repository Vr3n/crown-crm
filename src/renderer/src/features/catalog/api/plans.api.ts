import type { PlanRow } from '../../../../../shared/contracts/catalog'
import { mapPlanInput } from '../mappers'
import type { PlanInput } from '../types'

/**
 * Plans IPC facade (wire shape). Returns the shared-contract `PlanRow` exactly —
 * rupee/percent mapping happens in `mappers.ts`, consumed by `queries.ts`.
 */
export const plansApi = {
  listPlans(): Promise<PlanRow[]> {
    return window.api.catalog.listPlans()
  },

  listAvailablePlans(): Promise<PlanRow[]> {
    return window.api.catalog.listAvailablePlans()
  },

  createPlan(input: PlanInput): Promise<PlanRow> {
    return window.api.catalog.createPlan(mapPlanInput(input))
  },

  updatePlan(id: number, input: PlanInput): Promise<PlanRow> {
    return window.api.catalog.updatePlan({ planId: id, ...mapPlanInput(input) })
  },

  deletePlan(id: number): Promise<void> {
    return window.api.catalog.deletePlan({ planId: id })
  }
}
