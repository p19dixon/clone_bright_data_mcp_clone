import pino, { type LoggerOptions } from 'pino';

import { baseEnv } from './env.js';

const isDev = baseEnv.NODE_ENV === 'development';

const baseOptions: LoggerOptions = {
  level: baseEnv.LOG_LEVEL,
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: { colorize: true, ignore: 'pid,hostname' }
      }
    : undefined
};

const rootLogger = pino(baseOptions);

export function getLogger() {
  return rootLogger;
}

export function createLogger(bindings: Record<string, unknown>) {
  return rootLogger.child(bindings);
}
