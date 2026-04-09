import { NextRequest, NextResponse } from 'next/server';
import { jsonError } from '@/lib/api-errors';
import { getAdminAuthErrorResponse, requireAdminRequest } from '@/lib/route-guards';
import { buildInboxTask, createInboxTask } from '@/lib/kid-task-inbox';

export async function POST(request: NextRequest) {
  const authError = getAdminAuthErrorResponse(request);
  if (authError) return authError;

  try {
    requireAdminRequest(request);
    const body = (await request.json().catch(() => ({}))) as {
      kidId?: string;
      topic?: string;
      topicLabel?: string;
      targetWordCount?: number;
      rewardType?: 'image' | 'certificate' | 'message';
      rewardTheme?: string;
      createdBy?: string;
      instructions?: string;
    };

    const kidId = String(body.kidId || '').trim().toLowerCase();
    if (!['george', 'grace'].includes(kidId)) {
      return NextResponse.json({ error: 'Unsupported kidId' }, { status: 400 });
    }

    const task = buildInboxTask({
      topic: body.topic,
      topicLabel: body.topicLabel,
      targetWordCount: Number(body.targetWordCount || 20),
      rewardType: body.rewardType,
      rewardTheme: body.rewardTheme,
      createdBy: body.createdBy || 'parent-admin',
      instructions: body.instructions,
    });

    const result = await createInboxTask({ kidId, task });
    return NextResponse.json({
      ok: true,
      message: `已为 ${kidId} 创建新任务：${task.topicLabel || task.topic || task.id}`,
      task: result.task,
    });
  } catch (error) {
    return jsonError(error);
  }
}
