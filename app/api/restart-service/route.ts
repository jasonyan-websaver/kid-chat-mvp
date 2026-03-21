import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { jsonError } from '@/lib/api-errors';
import { getAdminAuthErrorResponse, requireAdminRequest } from '@/lib/route-guards';

const execFileAsync = promisify(execFile);

export async function POST(request: NextRequest) {
  const authError = getAdminAuthErrorResponse(request);
  if (authError) return authError;

  try {
    requireAdminRequest(request);
    const pm2Name = process.env.KID_CHAT_PM2_NAME?.trim() || 'kid-chat-mvp';

    await execFileAsync('pm2', ['restart', pm2Name], {
      cwd: process.cwd(),
      env: process.env,
      maxBuffer: 1024 * 1024,
    });

    return NextResponse.json({ ok: true, message: `服务 ${pm2Name} 正在重启，请稍等几秒后刷新页面。` });
  } catch (error) {
    return jsonError(error);
  }
}
