import { NextRequest, NextResponse } from 'next/server';
import { jsonError } from '@/lib/api-errors';
import { createAdminFrenchWritingTask } from '@/lib/admin-task-service';
import { getAdminAuthErrorResponse, requireAdminRequest } from '@/lib/route-guards';

export async function POST(request: NextRequest) {
  const authError = getAdminAuthErrorResponse(request);
  if (authError) return authError;

  try {
    requireAdminRequest(request);
    const body = (await request.json().catch(() => ({}))) as {
      kidId?: string;
      topic?: string;
      targetWordCount?: number;
      force?: boolean;
    };

    const kidId = String(body.kidId || '').trim().toLowerCase();
    if (!kidId) {
      return NextResponse.json({ error: 'Missing kidId' }, { status: 400 });
    }

    const result = await createAdminFrenchWritingTask({
      kidId,
      topic: body.topic,
      targetWordCount: body.targetWordCount,
      force: body.force === true,
    });

    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
