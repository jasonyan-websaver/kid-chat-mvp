import { NextRequest, NextResponse } from 'next/server';
import { readKidTextSettings, writeKidTextSettings } from '@/lib/kid-settings';
import { requireAdminRequest } from '@/lib/route-guards';

export async function GET(request: NextRequest) {
  try {
    requireAdminRequest(request);
    const values = await readKidTextSettings();
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
    requireAdminRequest(request);
    const body = (await request.json()) as Record<string, { title?: string; welcome?: string }>;
    await writeKidTextSettings(body || {});
    return NextResponse.json({ ok: true, message: '孩子标题和欢迎语已保存。' });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
