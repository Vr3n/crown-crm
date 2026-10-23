import { searchInputSchema } from '../../shared/contracts/search'
import { search } from '../application/search'
import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import { handle } from './handle'

export function registerSearchIpc(): void {
  handle(IPC_CHANNELS.SEARCH_QUERY, searchInputSchema, (input) => search(input))
}
