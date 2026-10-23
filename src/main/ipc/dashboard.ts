import { currentCompanyId } from '../auth/session'
import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import type { DashboardSummary } from '../../shared/contracts/dashboard'
import { dashboardRepo } from '../repositories/dashboard'
import { handle } from './handle'

/**
 * Dashboard read model. Every number is a query over rows; nothing is stored.
 * The work lives in `repositories/dashboard.ts` so the handler stays a boundary.
 */
export function registerDashboardIpc(): void {
  handle(IPC_CHANNELS.DASHBOARD_SUMMARY, (): DashboardSummary => {
    return dashboardRepo.summary(currentCompanyId())
  })
}
