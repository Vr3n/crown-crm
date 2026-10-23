import { and, eq } from 'drizzle-orm'
import { getDb, getDrizzle } from '../db/connection'
import { companies, voucherNumberSettings, voucherSequences } from '../db/schema'
import { financialYearLabel } from '../domain/fy'
import {
  NUMBERING_DEFAULTS,
  VOUCHER_TYPE_ORDER,
  formatVoucherNumber,
  nextSequenceValue
} from '../domain/numbering'
import type { VoucherType } from '../../shared/contracts/vouchers'
import type { NumberingRow } from '../../shared/contracts/numbering'

export interface NumberingSetting {
  voucherType: VoucherType
  series: string
  prefix: string
  suffix: string
  padding: number
  startNumber: number
  restartYearly: boolean
  manualOverride: boolean
}

/** The financial year key used to reset counters. Turned off by the setting. */
export function sequenceYear(fy: string, restartYearly: boolean): string {
  return restartYearly ? fy : 'ALL'
}

/**
 * Ensures every voucher type has a settings row. Seeded at company creation and
 * again on read so an upgraded database is never missing a type.
 */
export function ensureNumberingDefaults(companyId: number): void {
  const db = getDrizzle()
  for (const type of VOUCHER_TYPE_ORDER) {
    const defaults = NUMBERING_DEFAULTS[type]
    db.insert(voucherNumberSettings)
      .values({
        company_id: companyId,
        voucher_type: type,
        series: defaults.series,
        prefix: defaults.prefix,
        suffix: defaults.suffix,
        padding: defaults.padding,
        start_number: defaults.startNumber
      })
      .onConflictDoNothing()
      .run()
  }
}

function currentFy(companyId: number): string {
  const row = getDb()
    .prepare('SELECT fy_start_month FROM companies WHERE id = ?')
    .get(companyId) as { fy_start_month: number } | undefined
  return financialYearLabel(new Date().toISOString().slice(0, 10), row?.fy_start_month ?? 4)
}

export const numberingRepo = {
  ensureDefaults(companyId: number): void {
    ensureNumberingDefaults(companyId)
  },

  list(companyId: number): NumberingRow[] {
    ensureNumberingDefaults(companyId)
    const db = getDrizzle()
    const fy = currentFy(companyId)
    const settings = db
      .select()
      .from(voucherNumberSettings)
      .where(eq(voucherNumberSettings.company_id, companyId))
      .all()

    const byType = new Map(settings.map((row) => [row.voucher_type, row]))

    return VOUCHER_TYPE_ORDER.map((type) => {
      const row = byType.get(type)
      const defaults = NUMBERING_DEFAULTS[type]
      const setting: NumberingSetting = {
        voucherType: type,
        series: row?.series ?? defaults.series,
        prefix: row?.prefix ?? defaults.prefix,
        suffix: row?.suffix ?? defaults.suffix,
        padding: row?.padding ?? defaults.padding,
        startNumber: row?.start_number ?? defaults.startNumber,
        restartYearly: row?.restart_yearly ?? true,
        manualOverride: row?.manual_override ?? false
      }

      const seq =
        db
          .select({ lastValue: voucherSequences.last_value })
          .from(voucherSequences)
          .where(
            and(
              eq(voucherSequences.company_id, companyId),
              eq(voucherSequences.voucher_type, type),
              eq(voucherSequences.series, setting.series),
              eq(voucherSequences.fy, sequenceYear(fy, setting.restartYearly))
            )
          )
          .get() ?? null

      const used = getDb()
        .prepare('SELECT COUNT(*) AS n FROM vouchers WHERE company_id = ? AND voucher_type = ?')
        .get(companyId, type) as { n: number }

      const next = nextSequenceValue(seq?.lastValue ?? 0, setting.startNumber)
      return {
        voucherType: type,
        label: defaults.label,
        series: setting.series,
        prefix: setting.prefix,
        suffix: setting.suffix,
        padding: setting.padding,
        startNumber: setting.startNumber,
        restartYearly: setting.restartYearly,
        manualOverride: setting.manualOverride,
        fy,
        nextNumber: formatVoucherNumber(setting.prefix, next, setting.padding, setting.suffix),
        lastUsed: seq?.lastValue ?? 0,
        usedCount: used.n
      }
    })
  },

  get(companyId: number, type: VoucherType): NumberingSetting {
    ensureNumberingDefaults(companyId)
    const row = getDrizzle()
      .select()
      .from(voucherNumberSettings)
      .where(
        and(
          eq(voucherNumberSettings.company_id, companyId),
          eq(voucherNumberSettings.voucher_type, type)
        )
      )
      .get()
    const defaults = NUMBERING_DEFAULTS[type]
    if (!row) {
      return {
        voucherType: type,
        series: defaults.series,
        prefix: defaults.prefix,
        suffix: defaults.suffix,
        padding: defaults.padding,
        startNumber: defaults.startNumber,
        restartYearly: true,
        manualOverride: false
      }
    }
    return {
      voucherType: type,
      series: row.series,
      prefix: row.prefix,
      suffix: row.suffix,
      padding: row.padding,
      startNumber: row.start_number,
      restartYearly: row.restart_yearly,
      manualOverride: row.manual_override
    }
  },

  update(companyId: number, items: NumberingSetting[]): void {
    const db = getDrizzle()
    for (const item of items) {
      db.insert(voucherNumberSettings)
        .values({
          company_id: companyId,
          voucher_type: item.voucherType,
          series: item.series,
          prefix: item.prefix,
          suffix: item.suffix,
          padding: item.padding,
          start_number: item.startNumber,
          restart_yearly: item.restartYearly,
          manual_override: item.manualOverride
        })
        .onConflictDoUpdate({
          target: [voucherNumberSettings.company_id, voucherNumberSettings.voucher_type],
          set: {
            series: item.series,
            prefix: item.prefix,
            suffix: item.suffix,
            padding: item.padding,
            start_number: item.startNumber,
            restart_yearly: item.restartYearly,
            manual_override: item.manualOverride,
            updated_at: new Date().toISOString()
          }
        })
        .run()

      // Keep the open sequence row in step so the next number uses the new
      // prefix and width without consuming or renumbering anything.
      db.update(voucherSequences)
        .set({
          prefix: item.prefix,
          suffix: item.suffix,
          padding: item.padding
        })
        .where(
          and(
            eq(voucherSequences.company_id, companyId),
            eq(voucherSequences.voucher_type, item.voucherType),
            eq(voucherSequences.series, item.series)
          )
        )
        .run()
    }
  },

  markSetupComplete(companyId: number): void {
    getDb()
      .prepare("UPDATE companies SET numbering_setup_at = datetime('now') WHERE id = ?")
      .run(companyId)
  },

  markOnboardingComplete(companyId: number): void {
    getDb()
      .prepare("UPDATE companies SET onboarding_completed_at = datetime('now') WHERE id = ?")
      .run(companyId)
  },

  setupState(companyId: number): {
    numberingSetupAt: string | null
    onboardingCompletedAt: string | null
  } {
    const row = getDb()
      .prepare('SELECT numbering_setup_at, onboarding_completed_at FROM companies WHERE id = ?')
      .get(companyId) as
      { numbering_setup_at: string | null; onboarding_completed_at: string | null } | undefined
    return {
      numberingSetupAt: row?.numbering_setup_at ?? null,
      onboardingCompletedAt: row?.onboarding_completed_at ?? null
    }
  },

  companyExists(companyId: number): boolean {
    const row = getDrizzle()
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.id, companyId))
      .get()
    return Boolean(row)
  },

  vouchersUsing(type: VoucherType, companyId: number): number {
    const row = getDb()
      .prepare('SELECT COUNT(*) AS n FROM vouchers WHERE company_id = ? AND voucher_type = ?')
      .get(companyId, type) as { n: number }
    return row.n
  }
}
