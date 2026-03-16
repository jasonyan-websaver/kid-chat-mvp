import { NextRequest, NextResponse } from 'next/server';
import { getExpectedPinForKid, getPinCookieName, normalizeKidId } from '@/lib/pin';

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { pin?: string; kidId?: string; next?: string };
  const kidId = normalizeKidId(body.kidId);
  const expectedPin = getExpectedPinForKid(kidId);

  if (!kidId || !expectedPin) {
    return NextResponse.json({ ok: false, error: '未知的孩子入口' }, { status: 400 });
  }

  if (!body.pin || body.pin.trim() !== expectedPin) {
    return NextResponse.json({ ok: false, error: 'PIN 不正确' }, { status: 401 });
  }

  const nextPath = body.next && body.next.startsWith('/kid/') ? body.next : `/kid/${kidId}`;
  const response = NextResponse.json({ ok: true, next: nextPath });
  response.cookies.set(getPinCookieName(kidId), expectedPin, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });

  return response;
}
