import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_PIN_COOKIE, getExpectedAdminPin } from '@/lib/admin-pin';

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { pin?: string; next?: string };
  const expectedPin = getExpectedAdminPin();

  if (!expectedPin) {
    return NextResponse.json({ ok: false, error: '家长 PIN 尚未配置，请先在 .env.local 中设置 KID_CHAT_ADMIN_PIN' }, { status: 500 });
  }

  if (!body.pin || body.pin.trim() !== expectedPin) {
    return NextResponse.json({ ok: false, error: '家长 PIN 不正确' }, { status: 401 });
  }

  const requestedNext = body.next?.trim();
  const nextPath = requestedNext && requestedNext.startsWith('/admin') && requestedNext !== '/admin'
    ? requestedNext
    : '/admin/memory';
  const response = NextResponse.json({ ok: true, next: nextPath });
  response.cookies.set(ADMIN_PIN_COOKIE, expectedPin, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });

  return response;
}
