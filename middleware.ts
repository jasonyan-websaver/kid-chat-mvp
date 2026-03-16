import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getExpectedPinForKid, getPinCookieName } from '@/lib/pin';
import { ADMIN_PIN_COOKIE, getExpectedAdminPin } from '@/lib/admin-pin';

const PUBLIC_PATHS = [
  '/',
  '/enter-pin',
  '/enter-admin-pin',
  '/api/verify-pin',
  '/api/verify-admin-pin',
  '/api/clear-pin',
];

function buildExternalUrl(request: NextRequest, pathname: string, searchParams?: Record<string, string>) {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedPort = request.headers.get('x-forwarded-port');

  const protocol = forwardedProto || request.nextUrl.protocol.replace(':', '') || 'https';
  const host = forwardedHost || request.nextUrl.host;
  const portSuffix = forwardedPort && !host.includes(':') && !['80', '443'].includes(forwardedPort)
    ? `:${forwardedPort}`
    : '';

  const url = new URL(`${protocol}://${host}${portSuffix}${pathname}`);

  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value);
    }
  }

  return url;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/images') ||
    PUBLIC_PATHS.includes(pathname)
  ) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/admin')) {
    const adminCookie = request.cookies.get(ADMIN_PIN_COOKIE)?.value;
    const expectedAdminPin = getExpectedAdminPin();

    if (adminCookie === expectedAdminPin) {
      return NextResponse.next();
    }

    return NextResponse.redirect(
      buildExternalUrl(request, '/enter-admin-pin', {
        next: pathname,
      }),
    );
  }

  const kidMatch = pathname.match(/^\/kid\/([^/]+)/);
  const kidId = kidMatch?.[1]?.toLowerCase();

  if (!kidId) {
    return NextResponse.next();
  }

  const pinCookie = request.cookies.get(getPinCookieName(kidId))?.value;
  const expectedPin = getExpectedPinForKid(kidId);

  if (expectedPin && pinCookie === expectedPin) {
    return NextResponse.next();
  }

  return NextResponse.redirect(
    buildExternalUrl(request, '/enter-pin', {
      next: pathname,
      kid: kidId,
    }),
  );
}

export const config = {
  matcher: ['/((?!.*\\.).*)'],
};
