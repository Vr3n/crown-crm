export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

function shouldLog(level: LogLevel): boolean {
  const raw = import.meta.env.VITE_LOG_LEVEL?.toLowerCase()
  const levelValue = raw && raw in LEVEL_ORDER ? LEVEL_ORDER[raw as LogLevel] : LEVEL_ORDER.debug
  return LEVEL_ORDER[level] >= levelValue
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function write(level: LogLevel, args: unknown[]): void {
  if (!shouldLog(level)) return
  const timestamp = new Date().toISOString()
  const message = args.map((arg) => formatValue(arg)).join(' ')
  const line = `[renderer] ${timestamp} ${level.toUpperCase()} ${message}`
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
