import { NextRequest, NextResponse } from 'next/server';
import { jsonError } from '@/lib/api-errors';
import { resetKidTestData } from '@/lib/admin-task-service';
import { getAdminAuthErrorResponse, requireAdminRequest } from '@/lib/route-guards';

export async function POST(request: NextRequest) {
  const authError = getAdminAuthErrorResponse(request);
  if (authError) return authError;

  try {
    requireAdminRequest(request);

    const body = (await request.json().catch(() => ({}))) as { kidId?: string };
    const kidId = String(body.kidId || 'george').trim().toLowerCase();

    const result = await resetKidTestData(kidId);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
