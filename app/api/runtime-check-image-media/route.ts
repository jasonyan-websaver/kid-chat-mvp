import { NextRequest, NextResponse } from 'next/server';
import { runMediaAgentSmokeTest } from '@/lib/image-generation';
import { recordSmokeTest } from '@/lib/smoke-test-log';
import { requireAdminRequest } from '@/lib/route-guards';

export async function POST(request: NextRequest) {
  try {
    requireAdminRequest(request);
    const result = await runMediaAgentSmokeTest();
    const message = `智媒 smoke test 成功：${result.model}，返回 ${result.imageCount} 张图，用时 ${result.elapsedMs}ms。`;
    await recordSmokeTest({
      key: 'media-agent',
      label: '智媒 smoke test',
      ok: true,
      message,
      provider: result.provider,
      model: result.model,
      imageCount: result.imageCount,
      elapsedMs: result.elapsedMs,
      ranAt: new Date().toISOString(),
    });
    return NextResponse.json({ ...result, message });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await recordSmokeTest({
      key: 'media-agent',
      label: '智媒 smoke test',
      ok: false,
      message: `智媒 smoke test 失败：${message}`,
      ranAt: new Date().toISOString(),
    });
    return NextResponse.json({ error: `智媒 smoke test 失败：${message}` }, { status: 500 });
  }
}
