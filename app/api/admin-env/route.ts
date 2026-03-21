import { NextRequest, NextResponse } from 'next/server';
import { jsonError } from '@/lib/api-errors';
import { readAdminEnvValues, writeAdminEnvValues } from '@/lib/env-admin';
import { validateAdminEnvInput } from '@/lib/env-validation';
import { getAdminAuthErrorResponse, requireAdminRequest } from '@/lib/route-guards';

export async function GET(request: NextRequest) {
  const authError = getAdminAuthErrorResponse(request);
  if (authError) return authError;

  try {
    requireAdminRequest(request);
    const values = await readAdminEnvValues();
    return NextResponse.json(values);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireAdminRequest(request);
    const body = (await request.json()) as {
      kidPins?: Record<string, string>;
      adminPin?: string;
      useMock?: string;
      pm2Name?: string;
    };

    if (!body.kidPins || typeof body.adminPin !== 'string' || typeof body.useMock !== 'string' || typeof body.pm2Name !== 'string') {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
    }

    const validated = validateAdminEnvInput({
      kidPins: body.kidPins,
      adminPin: body.adminPin,
      useMock: body.useMock,
      pm2Name: body.pm2Name,
    });

    await writeAdminEnvValues(validated);

    return NextResponse.json({ ok: true, message: '环境变量已保存，重启服务后生效。' });
  } catch (error) {
    return jsonError(error);
  }
}
