import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { jsonError } from '@/lib/api-errors';
import { getAdminAuthErrorResponse, requireAdminRequest } from '@/lib/route-guards';
import { deleteTaskByState, getKidTaskDirs, moveTaskBetweenStates } from '@/lib/kid-task-inbox';

type BulkArchiveResult = {
  moved: number;
  failed: number;
};

async function moveJsonFiles(sourceDir: string, targetDir: string, nextStatus?: 'archived') : Promise<BulkArchiveResult> {
  const names = (await fs.readdir(sourceDir).catch(() => [] as string[])).filter((name) => name.endsWith('.json'));
  await fs.mkdir(targetDir, { recursive: true });
  let moved = 0;
  let failed = 0;

  for (const name of names) {
    const from = path.join(sourceDir, name);
    const to = path.join(targetDir, name);

    try {
      const raw = await fs.readFile(from, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const nextValue = nextStatus ? { ...parsed, status: nextStatus } : parsed;
      await fs.writeFile(to, JSON.stringify(nextValue, null, 2), 'utf8');
      await fs.rm(from, { force: true });
      moved += 1;
    } catch {
      failed += 1;
    }
  }

  return { moved, failed };
}

export async function POST(request: NextRequest) {
  const authError = getAdminAuthErrorResponse(request);
  if (authError) return authError;

  try {
    requireAdminRequest(request);
    const body = (await request.json().catch(() => ({}))) as { kidId?: string; action?: string; taskId?: string; from?: string; to?: string };
    const kidId = String(body.kidId || '').trim().toLowerCase();
    const action = String(body.action || '').trim();
    const taskId = String(body.taskId || '').trim();
    const from = String(body.from || '').trim() as 'pending' | 'claimed' | 'completed' | 'archived';
    const to = String(body.to || '').trim() as 'pending' | 'claimed' | 'completed' | 'archived';

    if (!['george', 'grace'].includes(kidId)) {
      return NextResponse.json({ error: 'Unsupported kidId' }, { status: 400 });
    }

    const dirs = getKidTaskDirs(kidId);
    if (!dirs) {
      return NextResponse.json({ error: 'Task directories unavailable' }, { status: 500 });
    }

    if (action === 'archive-current') {
      const movedClaimed = await moveJsonFiles(dirs.claimed, dirs.archived, 'archived');
      const movedInbox = await moveJsonFiles(dirs.inbox, dirs.archived, 'archived');
      const failureCount = movedClaimed.failed + movedInbox.failed;
      return NextResponse.json({ ok: true, message: `已归档 ${kidId} 的当前任务（claimed ${movedClaimed.moved}，inbox ${movedInbox.moved}）${failureCount ? `，失败 ${failureCount}` : ''}。` });
    }

    if (action === 'clear-all') {
      const movedInbox = await moveJsonFiles(dirs.inbox, dirs.archived, 'archived');
      const movedClaimed = await moveJsonFiles(dirs.claimed, dirs.archived, 'archived');
      const movedCompleted = await moveJsonFiles(dirs.completed, dirs.archived, 'archived');
      const failureCount = movedInbox.failed + movedClaimed.failed + movedCompleted.failed;
      return NextResponse.json({ ok: true, message: `已清空 ${kidId} 的全部任务（归档 inbox ${movedInbox.moved}，claimed ${movedClaimed.moved}，completed ${movedCompleted.moved}）${failureCount ? `，失败 ${failureCount}` : ''}。` });
    }

    if (action === 'move-task') {
      if (!taskId || !['pending', 'claimed', 'completed', 'archived'].includes(from) || !['pending', 'claimed', 'completed', 'archived'].includes(to)) {
        return NextResponse.json({ error: '缺少 taskId / from / to 参数' }, { status: 400 });
      }

      const movedTask = await moveTaskBetweenStates({ kidId, taskId, from, to });
      return NextResponse.json({ ok: true, message: `已将任务 ${taskId} 从 ${from} 移到 ${to}。`, task: movedTask });
    }

    if (action === 'delete-task') {
      if (!taskId || !['pending', 'claimed', 'completed', 'archived'].includes(from)) {
        return NextResponse.json({ error: '缺少 taskId / from 参数' }, { status: 400 });
      }

      await deleteTaskByState({ kidId, taskId, from });
      return NextResponse.json({ ok: true, message: `已删除任务 ${taskId}。` });
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    return jsonError(error);
  }
}
