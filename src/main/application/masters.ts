import { currentCompanyId, getSession, requirePermission } from '../auth/session'
import { withTransaction } from '../db/connection'
import { PERMISSIONS } from '../db/permissions'
import {
  accountRepo,
  godownRepo,
  itemRepo,
  partyRepo,
  taxRateRepo,
  unitRepo
} from '../repositories/masters'
import { ValidationError } from '../domain/errors'
import { addDaysIso, assertValidBusinessDate, DEFAULT_TIMEZONE, todayInOrgTz } from '../domain/dates'
import { formatRate } from '../../shared/contracts/money'
import type {
  AccountRow,
  CreateAccountInput,
  CreateItemInput,
  CreatePartyInput,
  CreateTaxRateInput,
  CreateUnitInput,
  ItemRow,
  PartyListInput,
  PartyRow,
  RetireTaxRateInput,
  ReviseTaxRateInput,
  TaxRateListInput,
  TaxRateRow,
  UnitListInput,
  UnitRow,
  UpdateItemInput,
  UpdatePartyInput,
  UpdateUnitInput
} from '../../shared/contracts/masters'

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/

function normalizeGstin(value?: string | null): string | null {
  const gstin = value?.trim().toUpperCase() || null
  if (gstin && !GSTIN_RE.test(gstin)) throw new ValidationError('Enter a valid 15 character GSTIN')
  return gstin
}

function currentBusinessDate(): string {
  return todayInOrgTz(DEFAULT_TIMEZONE)
}

function resolveAsOf(asOf?: string): string {
  if (asOf) assertValidBusinessDate(asOf, 'as of date')
  return asOf ?? currentBusinessDate()
}

function taxRateLabel(gstRateBps: number, cessRateBps: number): string {
  if (gstRateBps === 0 && cessRateBps === 0) return 'Exempt'
  const gst = gstRateBps === 0 ? 'Nil GST' : `GST ${formatRate(gstRateBps)}`
  return cessRateBps > 0 ? `${gst} + ${formatRate(cessRateBps)} cess` : gst
}

function normalizeTaxRate(input: CreateTaxRateInput): CreateTaxRateInput {
  assertValidBusinessDate(input.effectiveFrom, 'effective from')
  return {
    ...input,
    description: input.description?.trim() || taxRateLabel(input.gstRateBps, input.cessRateBps)
  }
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

  listUnits(input: UnitListInput): UnitRow[] {
    requirePermission(PERMISSIONS.ITEM_VIEW)
    return unitRepo.list(currentCompanyId(), input.includeInactive)
  },

  createUnit(input: CreateUnitInput): UnitRow {
    requirePermission(PERMISSIONS.SETTINGS_MANAGE)
    const companyId = currentCompanyId()
    const name = input.name.trim()
    const symbol = input.symbol.trim()
    const duplicate = unitRepo.findByNameOrSymbol(companyId, name, symbol)
    if (duplicate) {
      throw new ValidationError(`"${duplicate.name}" already uses that unit name or symbol`)
    }
    return unitRepo.create(companyId, { ...input, name, symbol })
  },

  updateUnit(input: UpdateUnitInput): UnitRow {
    requirePermission(PERMISSIONS.SETTINGS_MANAGE)
    const companyId = currentCompanyId()
    const existing = unitRepo.findById(companyId, input.id)
    if (!existing) throw new ValidationError('Unit not found')

    const name = input.name?.trim() ?? existing.name
    const symbol = input.symbol?.trim() ?? existing.symbol
    if (input.name !== undefined || input.symbol !== undefined) {
      const duplicate = unitRepo.findByNameOrSymbol(companyId, name, symbol, input.id)
      if (duplicate) {
        throw new ValidationError(`"${duplicate.name}" already uses that unit name or symbol`)
      }
    }

    if (input.isActive === false && existing.isActive && existing.usageCount > 0) {
      throw new ValidationError(
        `This unit is used by ${existing.usageCount} item${
          existing.usageCount === 1 ? '' : 's'
        }. Change those items to another unit first.`
      )
    }

    return unitRepo.update(companyId, input.id, {
      name: input.name === undefined ? undefined : name,
      symbol: input.symbol === undefined ? undefined : symbol,
      decimals: input.decimals,
      isActive: input.isActive
    })
  },

  deactivateUnit(id: number): UnitRow {
    requirePermission(PERMISSIONS.SETTINGS_MANAGE)
    const companyId = currentCompanyId()
    const existing = unitRepo.findById(companyId, id)
    if (!existing) throw new ValidationError('Unit not found')
    if (!existing.isActive) return existing
    if (existing.usageCount > 0) {
      throw new ValidationError(
        `This unit is used by ${existing.usageCount} item${
          existing.usageCount === 1 ? '' : 's'
        }. Change those items to another unit first.`
      )
    }
    return unitRepo.update(companyId, id, { isActive: false })
  },

  listTaxRates(input: TaxRateListInput): TaxRateRow[] {
    requirePermission(PERMISSIONS.ITEM_VIEW)
    const asOf = resolveAsOf(input.asOf)
    return taxRateRepo.list(currentCompanyId(), asOf, input.includeHistory)
  },

  createTaxRate(input: CreateTaxRateInput): TaxRateRow {
    requirePermission(PERMISSIONS.SETTINGS_MANAGE)
    const companyId = currentCompanyId()
    const normalized = normalizeTaxRate(input)
    const overlap = taxRateRepo.findOverlapping(
      companyId,
      normalized.gstRateBps,
      normalized.cessRateBps,
      normalized.effectiveFrom,
      null
    )
    if (overlap) {
      throw new ValidationError(
        `A ${taxRateLabel(normalized.gstRateBps, normalized.cessRateBps)} rate already runs from ${
          overlap.effectiveFrom
        }. Revise that rate instead of adding an overlapping one.`
      )
    }
    return taxRateRepo.create(companyId, normalized)
  },

  reviseTaxRate(input: ReviseTaxRateInput): TaxRateRow {
    requirePermission(PERMISSIONS.SETTINGS_MANAGE)
    return withTransaction(() => {
      const companyId = currentCompanyId()
      const asOf = currentBusinessDate()
      const existing = taxRateRepo.findById(companyId, input.id, asOf)
      if (!existing) throw new ValidationError('Tax rate not found')
      if (existing.effectiveTo) {
        throw new ValidationError('This rate has already ended. Add a new rate instead.')
      }
      if (input.effectiveFrom <= existing.effectiveFrom) {
        throw new ValidationError(
          `The new rate must start after ${existing.effectiveFrom}`
        )
      }

      const normalized = normalizeTaxRate(input)
      const overlap = taxRateRepo.findOverlapping(
        companyId,
        normalized.gstRateBps,
        normalized.cessRateBps,
        normalized.effectiveFrom,
        null,
        existing.id
      )
      if (overlap) {
        throw new ValidationError(
          `A ${taxRateLabel(normalized.gstRateBps, normalized.cessRateBps)} rate already runs from ${
            overlap.effectiveFrom
          }. Revise that rate instead.`
        )
      }

      taxRateRepo.setEffectiveTo(
        companyId,
        existing.id,
        addDaysIso(normalized.effectiveFrom, -1)
      )
      return taxRateRepo.create(companyId, normalized)
    })
  },

  retireTaxRate(input: RetireTaxRateInput): TaxRateRow {
    requirePermission(PERMISSIONS.SETTINGS_MANAGE)
    return withTransaction(() => {
      const companyId = currentCompanyId()
      const existing = taxRateRepo.findById(companyId, input.id, currentBusinessDate())
      if (!existing) throw new ValidationError('Tax rate not found')
      if (existing.effectiveTo) throw new ValidationError('This rate has already ended')
      if (input.effectiveFrom <= existing.effectiveFrom) {
        throw new ValidationError(
          `The end date must be after ${existing.effectiveFrom}`
        )
      }

      taxRateRepo.setEffectiveTo(
        companyId,
        existing.id,
        addDaysIso(input.effectiveFrom, -1)
      )
      const updated = taxRateRepo.findById(companyId, existing.id, currentBusinessDate())
      if (!updated) throw new ValidationError('Tax rate not found')
      return updated
    })
  }
}
