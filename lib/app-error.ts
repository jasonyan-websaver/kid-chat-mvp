export class AppError extends Error {
  status: number;
  code?: string;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    status = 500,
    options?: {
      code?: string;
      details?: Record<string, unknown>;
      cause?: unknown;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.status = status;
    this.code = options?.code;
    this.details = options?.details;
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

export function getErrorCode(error: unknown) {
  if (error instanceof AppError && error.code) {
    return error.code;
  }
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string') {
    return (error as { code: string }).code;
  }
  return undefined;
}
