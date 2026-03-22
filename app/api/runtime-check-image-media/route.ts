import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { runMediaAgentSmokeTest } from '@/lib/image-generation';
import { recordSmokeTest } from '@/lib/smoke-test-log';
import { requireAdminRequest } from '@/lib/route-guards';

function buildPreviewUrl(preview: string) {
  if (!preview.startsWith('/smoke-tests/')) return preview;
  const filename = preview.slice('/smoke-tests/'.length);
  return `/api/runtime-check-image-media?file=${encodeURIComponent(filename)}`;
}

export async function GET(request: NextRequest) {
  try {
    requireAdminRequest(request);
    const file = request.nextUrl.searchParams.get('file') || '';
    const safeName = path.basename(file);
    if (!safeName || safeName !== file) {
      return NextResponse.json({ error: '无效的预览文件名。' }, { status: 400 });
    }

    const filePath = path.join(process.cwd(), 'public', 'smoke-tests', safeName);
    const buffer = await fs.readFile(filePath);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store',
        'Content-Disposition': `inline; filename="${safeName}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取预览图失败';
    const status = /PIN/.test(message) ? 401 : 404;
    return NextResponse.json({ error: message }, { status });
  }
}

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
    return NextResponse.json({ ...result, firstImagePreview: buildPreviewUrl(result.firstImagePreview), message });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const debugMatch = message.match(/\nDEBUG:\s*(\{[\s\S]*\})$/);
    let debug: Record<string, unknown> | undefined;

    if (debugMatch?.[1]) {
      try {
        debug = JSON.parse(debugMatch[1]) as Record<string, unknown>;
      } catch {
        debug = { rawDebug: debugMatch[1] };
      }
    }

    const cleanMessage = message.replace(/\nDEBUG:\s*\{[\s\S]*\}$/m, '').trim();
    await recordSmokeTest({
      key: 'media-agent',
      label: '智媒 smoke test',
      ok: false,
      message: `智媒 smoke test 失败：${cleanMessage}`,
      ranAt: new Date().toISOString(),
    });
    return NextResponse.json({ error: `智媒 smoke test 失败：${cleanMessage}`, debug }, { status: 500 });
  }
}
