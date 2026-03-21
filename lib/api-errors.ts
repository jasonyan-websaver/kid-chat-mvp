import { NextResponse } from 'next/server';
import { getErrorMessage, getErrorStatus } from './app-error';

export function jsonError(error: unknown, fallbackStatus = 500) {
  return NextResponse.json(
    { error: getErrorMessage(error) },
    { status: getErrorStatus(error, fallbackStatus) },
  );
}
