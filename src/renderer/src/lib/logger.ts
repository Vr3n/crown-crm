import { invoke } from '@tauri-apps/api/core'

/**
 * One logger for the renderer.
 *
 * Every record is written to the console and, inside Tauri, batched to the
 * `log_event` command so it lands in the same JSONL file as the Rust logs.
 * `trace()` returns an id that is also sent to the backend `rpc` command, so a
 * renderer operation and the backend work it caused can be read as one trace.
 *
 * Logs never include passwords, tokens or secrets. The redactor is a safety
 * net; callers should still pass only the fields they need.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogFields = Record<string, unknown>

export interface LogError {
  code?: string
  message: string
}

interface LogRecord {
  ts: string
  level: LogLevel
  source: 'renderer'
  module: string
  event: string
  traceId?: string
  fields?: LogFields
  error?: LogError
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const SECRET_KEY = /pass(word)?|token|secret|pin|authorization/i
const QUEUE_LIMIT = 500
const BATCH_SIZE = 50

const queue: LogRecord[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
let dropped = 0

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function configuredLevel(): LogLevel {
  const raw = import.meta.env.VITE_LOG_LEVEL?.toLowerCase()
  return raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error' ? raw : 'debug'
}

function fileLevel(): number {
  return configuredLevel() === 'debug' ? LEVEL_ORDER.debug : LEVEL_ORDER.info
}

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth]'
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1))
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SECRET_KEY.test(key) ? '[redacted]' : redact(entry, depth + 1)
    }
    return result
  }
  if (typeof value === 'string' && value.length > 2000) return `${value.slice(0, 2000)}...`
  return value
}

function writeConsole(record: LogRecord): void {
  if (LEVEL_ORDER[record.level] < LEVEL_ORDER[configuredLevel()]) return
  const prefix = `[${record.module}] ${record.event}`
  const detail = record.fields ? redact(record.fields) : undefined
  const error = record.error ? ` ${record.error.message}` : ''
  if (record.level === 'error') console.error(prefix, detail ?? '', error)
  else if (record.level === 'warn') console.warn(prefix, detail ?? '', error)
  else if (record.level === 'debug') console.debug(prefix, detail ?? '')
  else console.log(prefix, detail ?? '')
}

function scheduleFlush(): void {
  if (!isTauri() || flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flush()
  }, 150)
}

async function flush(): Promise<void> {
  if (!isTauri() || queue.length === 0) return
  const batch = queue.splice(0, BATCH_SIZE)
  try {
    await invoke('log_event', { records: batch })
  } catch (error) {
    console.error('[logger] could not write to the log file', error)
  }
  if (queue.length > 0) scheduleFlush()
}

function emit(
  level: LogLevel,
  module: string,
  event: string,
  fields?: LogFields,
  traceId?: string,
  error?: LogError
): void {
  const record: LogRecord = {
    ts: new Date().toISOString(),
    level,
    source: 'renderer',
    module,
    event,
    traceId,
    fields: fields ? (redact(fields) as LogFields) : undefined,
    error
  }
  writeConsole(record)
  if (!isTauri() || LEVEL_ORDER[level] < fileLevel()) return
  if (queue.length >= QUEUE_LIMIT) {
    queue.shift()
    dropped += 1
    if (dropped === 1 || dropped % 100 === 0) {
      console.warn(`[logger] dropped ${dropped} queued records`)
    }
  }
  queue.push(record)
  scheduleFlush()
}

function newTraceId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export const logger = {
  event(
    level: LogLevel,
    module: string,
    event: string,
    fields?: LogFields,
    traceId?: string,
    error?: LogError
  ): void {
    emit(level, module, event, fields, traceId, error)
  },

  debug(module: string, event: string, fields?: LogFields, traceId?: string): void {
    emit('debug', module, event, fields, traceId)
  },

  info(module: string, event: string, fields?: LogFields, traceId?: string): void {
    emit('info', module, event, fields, traceId)
  },

  warn(module: string, event: string, fields?: LogFields, traceId?: string): void {
    emit('warn', module, event, fields, traceId)
  },

  error(
    module: string,
    event: string,
    fields?: LogFields,
    traceId?: string,
    error?: LogError
  ): void {
    emit('error', module, event, fields, traceId, error)
  },

  /** Start a traced operation and return the id the backend should receive. */
  trace(module: string, event: string, fields?: LogFields): string {
    const traceId = newTraceId()
    emit('info', module, event, fields, traceId)
    return traceId
  },

  /** Finish a traced operation. */
  end(
    traceId: string,
    level: LogLevel,
    module: string,
    event: string,
    fields?: LogFields,
    error?: LogError
  ): void {
    emit(level, module, event, fields, traceId, error)
  },

  /** Best-effort flush, used when the window is closing. */
  flush(): void {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    void flush()
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => logger.flush())
}
