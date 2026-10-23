import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import { itemSummary, partySummary } from '../application/summaries'
import { handle } from './handle'

export function registerSummariesIpc(): void {
  handle(IPC_CHANNELS.PARTIES_SUMMARY, () => partySummary())
  handle(IPC_CHANNELS.ITEMS_SUMMARY, () => itemSummary())
}
