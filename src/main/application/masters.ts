import { currentCompanyId, getSession, requirePermission } from '../auth/session'
import { getDrizzle } from '../db/connection'
import { units } from '../db/schema'
import { PERMISSIONS } from '../db/permissions'
import { accountRepo, godownRepo, itemRepo, partyRepo, unitRepo } from '../repositories/masters'
import { ValidationError } from '../domain/errors'
import type {
  AccountRow,
  CreateAccountInput,
  CreateItemInput,
  CreatePartyInput,
  CreateUnitInput,
  ItemRow,
  PartyListInput,
  PartyRow,
  UpdateItemInput,
  UpdatePartyInput
} from '../../shared/contracts/masters'

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/

function normalizeGstin(value?: string | null): string | null {
  const gstin = value?.trim().toUpperCase() || null
  if (gstin && !GSTIN_RE.test(gstin)) throw new ValidationError('Enter a valid 15 character GSTIN')
  return gstin
}

export const masters = {
  listParties(input: PartyListInput): PartyRow[] {
    requirePermission(PERMISSIONS.PARTY_VIEW)
    return partyRepo.list(currentCompanyId(), input)
  },

  getParty(id: number): PartyRow {
    requirePermission(PERMISSIONS.PARTY_VIEW)
    const party = partyRepo.findById(currentCompanyId(), id)
    if (!party) throw new ValidationError('Party not found')
    return party
  },

  createParty(input: CreatePartyInput): PartyRow {
    requirePermission(PERMISSIONS.PARTY_CREATE)
    return partyRepo.create(
      currentCompanyId(),
      { ...input, gstin: normalizeGstin(input.gstin) },
      null
    )
  },

  updateParty(input: UpdatePartyInput): PartyRow {
    requirePermission(PERMISSIONS.PARTY_EDIT)
    return partyRepo.update(currentCompanyId(), {
      ...input,
      gstin: input.gstin === undefined ? undefined : normalizeGstin(input.gstin)
    })
  },

  deactivateParty(id: number): void {
    requirePermission(PERMISSIONS.PARTY_DEACTIVATE)
    partyRepo.setActive(currentCompanyId(), id, false)
  },

  listItems(query?: string, includeInactive = false): ItemRow[] {
    requirePermission(PERMISSIONS.ITEM_VIEW)
    return itemRepo.list(currentCompanyId(), query, includeInactive)
  },

  getItem(id: number): ItemRow {
    requirePermission(PERMISSIONS.ITEM_VIEW)
    const item = itemRepo.findById(currentCompanyId(), id)
    if (!item) throw new ValidationError('Item not found')
    return item
  },

  createItem(input: CreateItemInput): ItemRow {
    requirePermission(PERMISSIONS.ITEM_CREATE)
    if (input.name.trim().length < 2) throw new ValidationError('Item name is required')
    return itemRepo.create(currentCompanyId(), input, getSession()?.userId ?? null)
  },

  updateItem(input: UpdateItemInput): ItemRow {
    requirePermission(PERMISSIONS.ITEM_EDIT)
    return itemRepo.update(currentCompanyId(), input)
  },

  deactivateItem(id: number): void {
    requirePermission(PERMISSIONS.ITEM_DEACTIVATE)
    itemRepo.setActive(currentCompanyId(), id, false)
  },

  listAccounts(includeInactive = false): AccountRow[] {
    requirePermission(PERMISSIONS.COMPANY_VIEW)
    return accountRepo.list(currentCompanyId(), includeInactive)
  },

  listAccountGroups(): { id: number; name: string; nature: string }[] {
    requirePermission(PERMISSIONS.COMPANY_VIEW)
    return accountRepo.groups(currentCompanyId())
  },

  createAccount(input: CreateAccountInput): AccountRow {
    requirePermission(PERMISSIONS.SETTINGS_MANAGE)
    return accountRepo.create(currentCompanyId(), input)
  },

  deactivateAccount(id: number): void {
    requirePermission(PERMISSIONS.SETTINGS_MANAGE)
    accountRepo.setActive(currentCompanyId(), id, false)
  },

  listGodowns(): { id: number; name: string }[] {
    requirePermission(PERMISSIONS.ITEM_VIEW)
    return godownRepo.list(currentCompanyId())
  },

  listUnits(): { id: number; name: string; symbol: string }[] {
    requirePermission(PERMISSIONS.ITEM_VIEW)
    return unitRepo.list(currentCompanyId())
  },

  createUnit(input: CreateUnitInput): void {
    requirePermission(PERMISSIONS.SETTINGS_MANAGE)
    getDrizzle()
      .insert(units)
      .values({
        company_id: currentCompanyId(),
        name: input.name.trim(),
        symbol: input.symbol.trim(),
        decimals: input.decimals
      })
      .run()
  }
}
