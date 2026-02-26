export type LogLevel = 'info' | 'warn' | 'error';

function ts(): string {
  return new Date().toISOString();
}

export function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const payload = meta ? ` ${JSON.stringify(meta)}` : '';
  const line = `[${ts()}] [${level.toUpperCase()}] ${message}${payload}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}
