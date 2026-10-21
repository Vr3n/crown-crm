/**
 * Dashboard thresholds & domain configuration.
 *
 * These are the single source of truth for "how urgent is this row" styling
 * and for the cold-lead definition, so the colour/stage logic stays declarative
 * and easy to tune.
 */

/** Memberships expiring within this many days are flagged as "due soon". */
export const EXPIRING_SOON_DAYS = 7

/**
 * A non-terminal lead with no follow-up or activity within this many days is
 * considered to be turning cold.
 */
export const COLD_LEAD_DAYS = 4

/** Follow-ups due within this many days are shown on the dashboard. */
export const UPCOMING_FOLLOWUP_DAYS = 7

/** Max rows shown per dashboard table to keep the page scannable. */
export const MAX_ROWS = 6

/** Rows-per-page options offered by the dashboard data tables. */
export const PAGE_SIZE_OPTIONS = [6, 12, 24]
