export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
  layer: string;
  message: string;
  level?: LogLevel;
  [key: string]: unknown;
}

function emit(fields: LogFields): void {
  const payload = {
    timestamp: new Date().toISOString(),
    level: fields.level ?? 'info',
    ...fields,
  };

  if (__DEV__) {
    const { level, ...rest } = payload;
    if (level === 'error') {
      // eslint-disable-next-line no-console
      console.error(JSON.stringify(rest));
      return;
    }
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(rest));
  }
}

export const logger = {
  info(layer: string, message: string, extra?: Record<string, unknown>): void {
    emit({ layer, message, level: 'info', ...extra });
  },
  warn(layer: string, message: string, extra?: Record<string, unknown>): void {
    emit({ layer, message, level: 'warn', ...extra });
  },
  error(layer: string, message: string, extra?: Record<string, unknown>): void {
    emit({ layer, message, level: 'error', ...extra });
  },
};
