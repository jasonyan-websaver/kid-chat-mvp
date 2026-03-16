export class AppError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = 'AppError';
    this.status = status;
  }
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

export function getErrorStatus(error: unknown, fallback = 500) {
  if (error instanceof AppError) {
    return error.status;
  }
  return fallback;
}
