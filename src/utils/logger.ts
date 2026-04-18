/**
 * utils/logger.ts — Structured logging for Dirgha CLI
 * Replaces console.log with proper log levels and formatting
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const _require = createRequire(import.meta.url);

// Log levels in order of severity
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Get current log level from environment
const currentLevel = (process.env['DIRGHA_LOG_LEVEL'] as LogLevel) || 'info';
const minLevel = LEVELS[currentLevel] ?? 1;

// Log file path
const logDir = path.join(os.homedir(), '.dirgha', 'logs');
const logFile = path.join(logDir, `dirgha-${new Date().toISOString().split('T')[0]}.log`);

// Ensure log directory exists
try {
  fs.mkdirSync(logDir, { recursive: true });
} catch {
  // Ignore - logging to file is best-effort
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

function formatEntry(entry: LogEntry): string {
  const ctx = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
  return `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}${ctx}`;
}

function writeToFile(entry: LogEntry): void {
  try {
    fs.appendFileSync(logFile, formatEntry(entry) + '\n');
  } catch {
    // File logging is best-effort
  }
}

function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (LEVELS[level] < minLevel) return;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
  };

  // Console output with colors
  const colorize = {
    debug: '\x1b[36m', // Cyan
    info: '\x1b[32m',  // Green
    warn: '\x1b[33m',  // Yellow
    error: '\x1b[31m', // Red
    reset: '\x1b[0m',
  };

  if (level === 'error') {
    console.error(`${colorize.error}[ERROR]${colorize.reset} ${message}`);
  } else if (level === 'warn') {
    console.warn(`${colorize.warn}[WARN]${colorize.reset} ${message}`);
  } else if (level === 'debug') {
    console.debug(`${colorize.debug}[DEBUG]${colorize.reset} ${message}`);
  } else {
    console.log(`${colorize.info}[INFO]${colorize.reset} ${message}`);
  }

  // Also write to file (structured)
  writeToFile(entry);
}

// Export logger functions
export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => log('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => log('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => log('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => log('error', message, context),
};

// Convenience exports
export const debug = logger.debug;
export const info = logger.info;
export const warn = logger.warn;
export const error = logger.error;

// For replacing console.log usage
export function logSystem(message: string, context?: Record<string, unknown>): void {
  logger.info(message, context);
}
