import { NextRequest, NextResponse } from 'next/server';
import { jsonError } from '@/lib/api-errors';
import { getAdminAuthErrorResponse, requireAdminRequest } from '@/lib/route-guards';
import { readAdminTaskStatuses } from '@/lib/admin-task-status';

export async function GET(request: NextRequest) {
  const authError = getAdminAuthErrorResponse(request);
  if (authError) return authError;

  try {
    requireAdminRequest(request);

    const kids = await readAdminTaskStatuses();
    return NextResponse.json({ kids });
  } catch (error) {
    return jsonError(error);
  }
}
