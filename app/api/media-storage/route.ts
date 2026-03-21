import { NextRequest, NextResponse } from 'next/server';
import { AppError, getErrorMessage, getErrorStatus } from '@/lib/app-error';
import { cleanupKidMediaStorage, getMediaStorageSummary } from '@/lib/media-storage';
import { requireAdminRequest, requireKnownKidId } from '@/lib/route-guards';

export async function GET(request: NextRequest) {
  try {
    requireAdminRequest(request);
    const summary = await getMediaStorageSummary();
    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: getErrorStatus(error, 500) });
  }
}

export async function POST(request: NextRequest) {
  try {
    requireAdminRequest(request);
    const body = (await request.json()) as { kidId?: string };
    const kidId = requireKnownKidId(String(body.kidId || ''));
    const cleaned = await cleanupKidMediaStorage(kidId);
    const summary = await getMediaStorageSummary();
    return NextResponse.json({
      ok: true,
      cleaned,
      summary,
      message: `已清理 ${kidId} 的本地图片缓存。`,
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: getErrorStatus(error, 500) });
  }
}
