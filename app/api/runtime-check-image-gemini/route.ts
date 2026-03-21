import { NextRequest, NextResponse } from 'next/server';
import { runGeminiDirectSmokeTest } from '@/lib/image-generation';
import { recordSmokeTest } from '@/lib/smoke-test-log';
import { requireAdminRequest } from '@/lib/route-guards';

export async function POST(request: NextRequest) {
  try {
    requireAdminRequest(request);
    const result = await runGeminiDirectSmokeTest();
    const message = `Gemini direct smoke test 成功：${result.model}，返回 ${result.imageCount} 张图，用时 ${result.elapsedMs}ms。`;
    await recordSmokeTest({
      key: 'gemini-direct',
      label: 'Gemini direct smoke test',
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
      key: 'gemini-direct',
      label: 'Gemini direct smoke test',
      ok: false,
      message: `Gemini direct smoke test 失败：${message}`,
      ranAt: new Date().toISOString(),
    });
    return NextResponse.json({ error: `Gemini direct smoke test 失败：${message}` }, { status: 500 });
  }
}
