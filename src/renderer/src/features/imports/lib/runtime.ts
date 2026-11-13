import type {
  CreateItemInput,
  CreatePartyInput,
  ItemRow,
  PartyRow
} from '@shared/contracts/masters'
import type { PostVoucherInput } from '@shared/contracts/vouchers'
import type { ImportResult } from '@shared/excel-import/types'

/**
 * The boundary between the importer and the rest of the app.
 *
 * The page never calls `window.api` directly. That keeps the demo runtime and
 * the tests on the same path as the real Tauri app.
 */
export interface ImportCompany {
  stateCode: string
  /** INVOICE rounds the bill total; LINE and NONE do not. */
  roundOffMode: string
}

export interface ImportRuntime {
  readonly source: 'app' | 'demo'
  company(): Promise<ImportCompany>
  listParties(): Promise<PartyRow[]>
  listItems(): Promise<ItemRow[]>
  createParty(input: CreatePartyInput): Promise<PartyRow>
  createItem(input: CreateItemInput): Promise<ItemRow>
  postVoucher(input: PostVoucherInput): Promise<ImportResult>
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export const appRuntime: ImportRuntime = {
  source: 'app',
  async company() {
    const company = await window.api.identity.company()
    return {
      stateCode: company?.stateCode ?? '27',
      roundOffMode: company?.roundOffMode ?? 'INVOICE'
    }
  },
  listParties() {
    return window.api.parties.list({ role: 'BOTH', includeInactive: false })
  },
  listItems() {
    return window.api.items.list()
  },
  createParty(input) {
    return window.api.parties.create(input)
  },
  createItem(input) {
    return window.api.items.create(input)
  },
  postVoucher(input) {
    return window.api.vouchers.post(input)
  }
}
