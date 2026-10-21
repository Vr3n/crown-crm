export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

function resolveLevel(): LogLevel {
  const raw = process.env.GYMCRM_LOG_LEVEL?.toLowerCase()
  return raw && raw in LEVEL_ORDER ? (raw as LogLevel) : 'info'
}

const enabledLevel = resolveLevel()

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[enabledLevel]
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/** Truncates a value so large payloads (e.g. full lead rows) stay readable. */
export function short(value: unknown, maxChars = 200): string {
  const text = formatValue(value)
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text
}

/** Full-length formatting for error messages where truncation hides the cause. */
export function full(value: unknown): string {
  return formatValue(value)
}

function write(level: LogLevel, args: unknown[]): void {
  if (!shouldLog(level)) return
  const timestamp = new Date().toISOString()
  const message = args.map((arg) => formatValue(arg)).join(' ')
  const line = `[main] ${timestamp} ${level.toUpperCase()} ${message}`
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  debug: (...args: unknown[]) => write('debug', args),
  info: (...args: unknown[]) => write('info', args),
  warn: (...args: unknown[]) => write('warn', args),
  error: (...args: unknown[]) => write('error', args)
}
