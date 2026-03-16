import { NextResponse } from 'next/server';
import { ADMIN_PIN_COOKIE } from '@/lib/admin-pin';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_PIN_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(0),
  });

  return response;
}
