/**
 * Logger utility — wraps console with level + namespace + timestamp
 *
 * 与上游 connector 的 utils/logger.ts 行为一致：去 OpenClaw 依赖，
 * 改用 console 加上 namespace 前缀，便于 DSH 进程级日志聚合。
 */

type Level = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const envLevel = (process.env.DINGTALK_LOG_LEVEL as Level | undefined) ?? 'info'
const minLevel = LEVEL_ORDER[envLevel] ?? LEVEL_ORDER.info

function format(level: Level, ns: string, msg: string, meta?: unknown): string {
  const ts = new Date().toISOString()
  const tag = `[${ts}] [${level.toUpperCase()}] [${ns}]`
  if (meta !== undefined) {
    try {
      return `${tag} ${msg} ${JSON.stringify(meta)}`
    } catch {
      return `${tag} ${msg} [unserializable meta]`
    }
  }
  return `${tag} ${msg}`
}

export interface Logger {
  debug(msg: string, meta?: unknown): void
  info(msg: string, meta?: unknown): void
  warn(msg: string, meta?: unknown): void
  error(msg: string, meta?: unknown): void
  child(suffix: string): Logger
}

export function createLogger(ns: string): Logger {
  function emit(level: Level, msg: string, meta?: unknown) {
    if (LEVEL_ORDER[level] < minLevel) return
    const line = format(level, ns, msg, meta)
    if (level === 'error') console.error(line)
    else if (level === 'warn') console.warn(line)
    else console.log(line)
  }
  return {
    debug: (msg, meta) => emit('debug', msg, meta),
    info: (msg, meta) => emit('info', msg, meta),
    warn: (msg, meta) => emit('warn', msg, meta),
    error: (msg, meta) => emit('error', msg, meta),
    child: (suffix) => createLogger(`${ns}:${suffix}`),
  }
}