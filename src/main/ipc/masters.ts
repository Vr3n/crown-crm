import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import {
  createAccountInputSchema,
  createItemInputSchema,
  createPartyInputSchema,
  createUnitInputSchema,
  listAccountsInputSchema,
  itemIdSchema,
  itemListInputSchema,
  partyIdSchema,
  partyListInputSchema,
  updateItemInputSchema,
  updatePartyInputSchema
} from '../../shared/contracts/masters'
import { masters } from '../application/masters'
import { handle } from './handle'

export function registerMastersIpc(): void {
  handle(IPC_CHANNELS.PARTIES_LIST, partyListInputSchema, (input) => masters.listParties(input))
  handle(IPC_CHANNELS.PARTIES_GET, partyIdSchema, (input) => masters.getParty(input.id))
  handle(IPC_CHANNELS.PARTIES_CREATE, createPartyInputSchema, (input) => masters.createParty(input))
  handle(IPC_CHANNELS.PARTIES_UPDATE, updatePartyInputSchema, (input) => masters.updateParty(input))
  handle(IPC_CHANNELS.PARTIES_DEACTIVATE, partyIdSchema, (input) =>
    masters.deactivateParty(input.id)
  )

  handle(IPC_CHANNELS.ITEMS_LIST, itemListInputSchema, (input) =>
    masters.listItems(input.query, input.includeInactive)
  )
  handle(IPC_CHANNELS.ITEMS_GET, itemIdSchema, (input) => masters.getItem(input.id))
  handle(IPC_CHANNELS.ITEMS_CREATE, createItemInputSchema, (input) => masters.createItem(input))
  handle(IPC_CHANNELS.ITEMS_UPDATE, updateItemInputSchema, (input) => masters.updateItem(input))
  handle(IPC_CHANNELS.ITEMS_DEACTIVATE, itemIdSchema, (input) => masters.deactivateItem(input.id))

  handle(IPC_CHANNELS.ACCOUNTS_LIST, listAccountsInputSchema, (input) =>
    masters.listAccounts(input.includeInactive)
  )
  handle(IPC_CHANNELS.ACCOUNTS_GROUPS, () => masters.listAccountGroups())
  handle(IPC_CHANNELS.ACCOUNTS_CREATE, createAccountInputSchema, (input) =>
    masters.createAccount(input)
  )
  handle(IPC_CHANNELS.ACCOUNTS_DEACTIVATE, partyIdSchema, (input) =>
    masters.deactivateAccount(input.id)
  )
  handle(IPC_CHANNELS.UNITS_LIST, () => masters.listUnits())
  handle(IPC_CHANNELS.UNITS_CREATE, createUnitInputSchema, (input) => masters.createUnit(input))
  handle(IPC_CHANNELS.GODOWNS_LIST, () => masters.listGodowns())
}
