import { NextRequest, NextResponse } from 'next/server';
import { readAdminEnvValues, writeAdminEnvValues } from '@/lib/env-admin';
import { validateAdminEnvInput } from '@/lib/env-validation';

export async function GET() {
  try {
    const values = await readAdminEnvValues();
    return NextResponse.json(values);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
