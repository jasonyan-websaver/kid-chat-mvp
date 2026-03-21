import { NextRequest, NextResponse } from 'next/server';
import { getErrorMessage, getErrorStatus } from '@/lib/app-error';
import { readKidProfile, writeKidProfile } from '@/lib/profile-admin';
import { requireAdminRequest, requireKnownKidId } from '@/lib/route-guards';

export async function GET(request: NextRequest) {
  try {
    requireAdminRequest(request);
    const kidId = request.nextUrl.searchParams.get('kidId');
    if (!kidId) {
      return NextResponse.json({ error: 'kidId is required' }, { status: 400 });
    }

    const content = await readKidProfile(requireKnownKidId(kidId));
    return NextResponse.json({ content });
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: getErrorStatus(error, 500) },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    requireAdminRequest(request);
    const body = (await request.json()) as { kidId?: string; content?: string; allowUnknownFields?: boolean };
    if (!body.kidId || typeof body.content !== 'string') {
      return NextResponse.json({ error: 'kidId and content are required' }, { status: 400 });
    }

    await writeKidProfile(requireKnownKidId(body.kidId), body.content, {
      allowUnknownFields: body.allowUnknownFields === true,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: getErrorStatus(error, 500) },
    );
  }
}
