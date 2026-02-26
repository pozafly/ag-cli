export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'APP_ERROR',
    public readonly causeDetail?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
