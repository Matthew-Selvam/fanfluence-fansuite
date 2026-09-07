/**
 * Structured logging (spec §67). Credentials must never reach a log line, so
 * every payload passes through a redactor before serialisation.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, fatal: 50 };

const SECRET_KEY_RE =
  /(api[-_]?key|secret|token|password|passwd|authorization|auth[-_]?header|credential|bearer|private[-_]?key|cookie|session)/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth]';
  if (value === null || value === undefined) return value;
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_RE.test(k) ? '[redacted]' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export interface LogRecord {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  [key: string]: unknown;
}

export type LogSink = (record: LogRecord) => void;

export const consoleSink: LogSink = (record) => {
  const line = JSON.stringify(record);
  if (record.level === 'error' || record.level === 'fatal') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
};

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  fatal(message: string, meta?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

export interface LoggerOptions {
  service: string;
  level?: LogLevel;
  sink?: LogSink;
  bindings?: Record<string, unknown>;
}

export function createLogger(opts: LoggerOptions): Logger {
  const level = opts.level ?? 'info';
  const sink = opts.sink ?? consoleSink;
  const bindings = opts.bindings ?? {};

  const emit = (lvl: LogLevel, message: string, meta?: Record<string, unknown>) => {
    if (LEVEL_RANK[lvl] < LEVEL_RANK[level]) return;
    sink({
      timestamp: new Date().toISOString(),
      level: lvl,
      service: opts.service,
      message,
      ...(redact(bindings) as Record<string, unknown>),
      ...(meta ? (redact(meta) as Record<string, unknown>) : {}),
    });
  };

  return {
    debug: (m, x) => emit('debug', m, x),
    info: (m, x) => emit('info', m, x),
    warn: (m, x) => emit('warn', m, x),
    error: (m, x) => emit('error', m, x),
    fatal: (m, x) => emit('fatal', m, x),
    child: (extra) =>
      createLogger({ service: opts.service, level, sink, bindings: { ...bindings, ...extra } }),
  };
}

/** Collects records in memory. Used by tests and by the developer log inspector. */
export function memorySink(): LogSink & { records: LogRecord[] } {
  const records: LogRecord[] = [];
  const sink = ((r: LogRecord) => {
    records.push(r);
    if (records.length > 5000) records.shift();
  }) as LogSink & { records: LogRecord[] };
  sink.records = records;
  return sink;
}
