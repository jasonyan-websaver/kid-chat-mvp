export class AppError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function getErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return error instanceof Error ? error.message : 'Unknown error';
}

export function getErrorStatus(error: unknown, fallback = 500) {
  if (error instanceof AppError) {
    return error.status;
  }
  if (error && typeof error === 'object' && 'status' in error) {
    const status = Number((error as { status?: unknown }).status);
    if (Number.isInteger(status) && status >= 400 && status <= 599) {
      return status;
    }
  }
  return fallback;
}
