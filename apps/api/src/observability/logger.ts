export interface Logger {
  info(event: Record<string, unknown>): void;
  error(event: Record<string, unknown>): void;
}

export function createLogger(level: 'silent' | 'error' | 'info'): Logger {
  const permittedKeys = new Set([
    'event',
    'requestId',
    'method',
    'route',
    'status',
    'durationMs',
    'code',
    'port',
    'mode',
    'provider',
    'reason',
  ]);
  const write = (event: Record<string, unknown>, severity: string) => {
    const safe = Object.fromEntries(
      Object.entries(event).filter(([key]) => permittedKeys.has(key)),
    );
    process.stdout.write(
      `${JSON.stringify({ timestamp: new Date().toISOString(), severity, ...safe })}\n`,
    );
  };
  return {
    info(event) {
      if (level === 'info') write(event, 'info');
    },
    error(event) {
      if (level !== 'silent') write(event, 'error');
    },
  };
}
