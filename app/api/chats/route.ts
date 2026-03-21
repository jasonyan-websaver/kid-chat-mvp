import { NextRequest, NextResponse } from 'next/server';
import { jsonError } from '@/lib/api-errors';
import { createChatForKid } from '@/lib/openclaw';
import { getChildAuthErrorResponse, requireChildRequest } from '@/lib/route-guards';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { kidId?: string };

    if (!body.kidId) {
      return NextResponse.json({ error: 'kidId is required' }, { status: 400 });
    }

    const authError = getChildAuthErrorResponse(request, body.kidId);
    if (authError) return authError;

    const kidId = requireChildRequest(request, body.kidId);
    const result = await createChatForKid(kidId);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
