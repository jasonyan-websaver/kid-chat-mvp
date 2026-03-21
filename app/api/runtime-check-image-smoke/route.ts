import { NextRequest, NextResponse } from 'next/server';
import { runImageGenerationSmokeTest } from '@/lib/image-generation';
import { recordSmokeTest } from '@/lib/smoke-test-log';
import { requireAdminRequest } from '@/lib/route-guards';

export async function POST(request: NextRequest) {
  try {
    requireAdminRequest(request);
    const result = await runImageGenerationSmokeTest();
    const message = `图片生成 smoke test 成功：${result.provider} / ${result.model}，返回 ${result.imageCount} 张图，用时 ${result.elapsedMs}ms。`;
    await recordSmokeTest({
      key: 'chain',
      label: '整链 smoke test',
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
      key: 'chain',
      label: '整链 smoke test',
      ok: false,
      message: `图片生成 smoke test 失败：${message}`,
      ranAt: new Date().toISOString(),
    });
    return NextResponse.json({ error: `图片生成 smoke test 失败：${message}` }, { status: 500 });
  }
}
