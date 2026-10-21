/**
 * Shared format helpers for export column definitions.
 *
 * These functions build `ExportColumn` objects for common data patterns
 * (money in paise/rupees, ISO dates, etc.) so each table doesn't repeat
 * the same boilerplate.
 */

import type { ExportColumn } from './api'

/** Creates an export column for money values (stored as integer rupees). */
export function moneyColumn(header: string, key: string, opts?: { width?: number }): ExportColumn {
  return { header, key, format: 'money', width: opts?.width ?? 14 }
}

/** Creates an export column for ISO date strings. */
export function dateColumn(header: string, key: string, opts?: { width?: number }): ExportColumn {
  return { header, key, format: 'date', width: opts?.width ?? 14 }
}

/** Creates an export column for ISO datetime strings. */
export function datetimeColumn(
  header: string,
  key: string,
  opts?: { width?: number }
): ExportColumn {
  return { header, key, format: 'datetime', width: opts?.width ?? 20 }
}

/** Creates a plain text export column. */
export function textColumn(header: string, key: string, opts?: { width?: number }): ExportColumn {
  return { header, key, format: 'text', width: opts?.width ?? 16 }
}

/** Creates a numeric export column. */
export function numberColumn(header: string, key: string, opts?: { width?: number }): ExportColumn {
  return { header, key, format: 'number', width: opts?.width ?? 12 }
}
