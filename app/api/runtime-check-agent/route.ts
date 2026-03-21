import { execFile } from 'child_process';
import { promisify } from 'util';
import { NextRequest, NextResponse } from 'next/server';
import { getConfiguredKidById } from '@/lib/kid-settings';
import { getAdminAuthErrorResponse, requireAdminRequest, requireKnownKidId } from '@/lib/route-guards';

const execFileAsync = promisify(execFile);

export async function POST(request: NextRequest) {
  const authError = getAdminAuthErrorResponse(request);
  if (authError) return authError;

  try {
    requireAdminRequest(request);
    const body = (await request.json()) as { kidId?: string };
    const kidId = requireKnownKidId(String(body.kidId || ''));

    if (process.env.OPENCLAW_USE_MOCK === 'true') {
      return NextResponse.json({
        ok: true,
        message: '当前是模拟模式（OPENCLAW_USE_MOCK=true），已跳过真实 agent 连通性测试。',
      });
    }

    const kid = await getConfiguredKidById(kidId);
    if (!kid) {
      return NextResponse.json({ error: '未知的孩子入口。' }, { status: 400 });
    }

    if (!kid.agentId?.trim()) {
      return NextResponse.json({ error: `孩子 ${kid.name} 尚未配置 agentId。` }, { status: 500 });
    }

    const { stdout } = await execFileAsync(
      'openclaw',
      ['agent', '--agent', kid.agentId, '--message', 'Reply with exactly: OK', '--json'],
      {
        cwd: process.cwd(),
        timeout: 20000,
        maxBuffer: 1024 * 1024 * 5,
      },
    );

    return NextResponse.json({
      ok: true,
      message: `${kid.name} 的 agent（${kid.agentId}）连通性正常。`,
      preview: stdout.slice(0, 500),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('spawn openclaw ENOENT')) {
      return NextResponse.json({ error: '服务器上找不到 openclaw 命令，请先安装并确认 PATH 配置正确。' }, { status: 500 });
    }

    if (message.includes('timed out')) {
      return NextResponse.json({ error: 'agent 连通性测试超时，请检查 OpenClaw 或 agent 响应状态。' }, { status: 504 });
    }

    return NextResponse.json({ error: `agent 连通性测试失败：${message}` }, { status: 502 });
  }
}
