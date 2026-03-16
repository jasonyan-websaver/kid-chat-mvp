import { NextRequest, NextResponse } from 'next/server';
import { getAllKidIds } from '@/lib/kids';
import { getPinCookieName, normalizeKidId } from '@/lib/pin';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({} as { kidId?: string }));
  const response = NextResponse.json({ ok: true });
  const kidId = normalizeKidId(body.kidId);

  if (kidId) {
    response.cookies.set(getPinCookieName(kidId), '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: new Date(0),
    });
    return response;
  }

  for (const id of getAllKidIds()) {
    response.cookies.set(getPinCookieName(id), '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: new Date(0),
    });
  }

  return response;
}
