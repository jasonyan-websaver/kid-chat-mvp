import { NextRequest, NextResponse } from 'next/server';
import { getImageGenerationRuntimeCheck } from '@/lib/runtime-check-image';
import { getAdminAuthErrorResponse, requireAdminRequest } from '@/lib/route-guards';

export async function GET(request: NextRequest) {
  const authError = getAdminAuthErrorResponse(request);
  if (authError) return authError;

  try {
    requireAdminRequest(request);
    const result = await getImageGenerationRuntimeCheck();

    return NextResponse.json({
      ok: result.issues.length === 0,
      ...result,
      message:
        result.issues.length === 0
          ? '图片生成运行时检查通过。'
          : `图片生成运行时有 ${result.issues.length} 个需要注意的问题。`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `图片生成运行时检查失败：${message}` }, { status: 500 });
  }
}
