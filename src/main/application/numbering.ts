import { withTransaction } from '../db/connection'
import { PERMISSIONS } from '../db/permissions'
import { ValidationError } from '../domain/errors'
import { validateNumberingSetting } from '../domain/numbering'
import { numberingRepo, type NumberingSetting } from '../repositories/numbering'
import { currentCompanyId, requirePermission } from '../auth/session'
import type { UpdateNumberingInput } from '../../shared/contracts/numbering'
import type { NumberingRow } from '../../shared/contracts/numbering'

/** Voucher numbering for the active company, with a next number preview. */
export function listNumbering(): NumberingRow[] {
  requirePermission(PERMISSIONS.SETTINGS_MANAGE)
  return numberingRepo.list(currentCompanyId())
}

/**
 * Saves the numbering settings. The update is idempotent by construction: the
 * same payload always produces the same rows and never touches a posted
 * voucher. `requestId` is accepted so the channel follows the mutation contract.
 */
export function updateNumbering(input: UpdateNumberingInput): NumberingRow[] {
  requirePermission(PERMISSIONS.SETTINGS_MANAGE)
  const companyId = currentCompanyId()

  const items: NumberingSetting[] = input.items.map((item) => {
    const normalized = {
      ...item,
      series: item.series.trim().toUpperCase(),
      prefix: item.prefix.trim(),
      suffix: item.suffix.trim()
    }
    const problem = validateNumberingSetting(normalized)
    if (problem) {
      throw new ValidationError(`${item.voucherType}: ${problem}`)
    }
    return normalized
  })

  return withTransaction(() => {
    numberingRepo.update(companyId, items)
    numberingRepo.markSetupComplete(companyId)
    // Saving numbering is the end of first run. The dashboard checklist, not a
    // separate tour screen, carries the rest of onboarding from here.
    numberingRepo.markOnboardingComplete(companyId)
    return numberingRepo.list(companyId)
  })
}
