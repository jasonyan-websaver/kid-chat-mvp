import { NextRequest, NextResponse } from 'next/server';
import { AppError } from './app-error';
import { ADMIN_PIN_COOKIE, getExpectedAdminPin } from './admin-pin';
import { getAllKidIds } from './kids';
import { getExpectedPinForKid, getPinCookieName, normalizeKidId } from './pin';
import { normalizeKnownChatId, normalizeKnownKidId } from './storage-ids';

export function requireAdminRequest(request: NextRequest) {
  const expectedAdminPin = getExpectedAdminPin();
  const adminCookie = request.cookies.get(ADMIN_PIN_COOKIE)?.value || '';

  if (!expectedAdminPin || adminCookie !== expectedAdminPin) {
    throw new AppError('需要先通过家长 PIN 验证。', 401);
  }
}

export function getAdminAuthErrorResponse(request: NextRequest) {
  try {
    requireAdminRequest(request);
    return null;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '需要先通过家长 PIN 验证。' }, { status: 401 });
  }
}

export function requireKnownKidId(kidId: string) {
  return normalizeKnownKidId(kidId);
}

export function requireChildRequest(request: NextRequest, kidId: string) {
  const normalizedKidId = requireKnownKidId(kidId);
  const expectedPin = getExpectedPinForKid(normalizedKidId);
  const pinCookie = request.cookies.get(getPinCookieName(normalizedKidId))?.value || '';

  if (!expectedPin || pinCookie !== expectedPin) {
    throw new AppError('需要先通过孩子 PIN 验证。', 401);
  }

  return normalizedKidId;
}

export function getChildAuthErrorResponse(request: NextRequest, kidId: string) {
  try {
    requireChildRequest(request, kidId);
    return null;
  } catch (error) {
    const status = error instanceof AppError && error.status === 400 ? 400 : 401;
    return NextResponse.json({ error: error instanceof Error ? error.message : '需要先通过孩子 PIN 验证。' }, { status });
  }
}

export function requireKnownChatId(chatId: string) {
  return normalizeKnownChatId(chatId);
}

export function isKnownKidId(kidId: string) {
  return getAllKidIds().includes(normalizeKidId(kidId));
}
