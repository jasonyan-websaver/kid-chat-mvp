import { randomUUID } from 'crypto';

export function createRequestId() {
  return randomUUID();
}

export function maskIdentifier(value: string | undefined | null) {
  if (!value) return undefined;
  return value.length <= 6 ? value : `${value.slice(0, 3)}***${value.slice(-2)}`;
}

export function summarizeText(value: string | undefined | null, max = 120) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text) return '';
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

export function getErrorSummary(error: unknown) {
  if (error instanceof Error) {
    const candidate = error as Error & { status?: unknown; code?: unknown; cause?: unknown };
    return {
      name: candidate.name,
      message: candidate.message,
      status: typeof candidate.status === 'number' ? candidate.status : undefined,
      code: typeof candidate.code === 'string' ? candidate.code : undefined,
      cause: candidate.cause instanceof Error
        ? {
            name: candidate.cause.name,
            message: candidate.cause.message,
          }
        : candidate.cause,
    };
  }

  return {
    message: typeof error === 'string' ? error : 'Unknown error',
  };
}

export function logInfo(event: string, fields: Record<string, unknown>) {
  console.info(JSON.stringify({ level: 'info', event, ...fields }));
}

export function logError(event: string, fields: Record<string, unknown>) {
  console.error(JSON.stringify({ level: 'error', event, ...fields }));
}
