import { NextRequest, NextResponse } from 'next/server';
import { jsonError } from '@/lib/api-errors';
import { readKidAgentMemory, writeKidAgentMemory } from '@/lib/memory-admin';
import { getAdminAuthErrorResponse, requireAdminRequest, requireKnownKidId } from '@/lib/route-guards';

export async function GET(request: NextRequest) {
  const authError = getAdminAuthErrorResponse(request);
  if (authError) return authError;

  try {
    requireAdminRequest(request);
    const kidId = request.nextUrl.searchParams.get('kidId');
    if (!kidId) {
      return NextResponse.json({ error: 'kidId is required' }, { status: 400 });
    }

    const content = await readKidAgentMemory(requireKnownKidId(kidId));
    return NextResponse.json({ content });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireAdminRequest(request);
    const body = (await request.json()) as { kidId?: string; content?: string };
    if (!body.kidId || typeof body.content !== 'string') {
      return NextResponse.json({ error: 'kidId and content are required' }, { status: 400 });
    }

    await writeKidAgentMemory(requireKnownKidId(body.kidId), body.content);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
