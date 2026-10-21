import type { PlanVersionRow } from '../../../../../shared/contracts/catalog'

/**
 * Plan-version IPC facade (wire shape). Reads a plan's price history, oldest
 * first — surfaced on the Plans page after an edit.
 */
export const versionsApi = {
  listPlanVersions(planId: number): Promise<PlanVersionRow[]> {
    return window.api.catalog.listPlanVersions({ planId })
  }
}
