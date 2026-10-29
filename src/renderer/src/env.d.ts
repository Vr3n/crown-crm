/// <reference types="vite/client" />

/**
 * Readiness flag for the invoice print route. The hidden print window polls
 * this after `did-finish-load`; it must stay `undefined` while the query is
 * still running so the main process never prints a skeleton.
 */
interface Window {
  __invoicePrintState?: { ready: boolean; error?: string }
}
