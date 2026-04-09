import { NextRequest, NextResponse } from 'next/server';
import { createAdminFrenchWritingTask, getKidTaskGate } from '@/lib/admin-task-service';
import { readFrenchWritingTask } from '@/lib/french-writing';
import { getChildAuthErrorResponse, requireChildRequest, requireKnownChatId } from '@/lib/route-guards';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const rawKidId = String(url.searchParams.get('kidId') || '').trim();
  const rawChatId = String(url.searchParams.get('chatId') || '').trim();

  if (!rawKidId || !rawChatId) {
    return NextResponse.json({ error: 'Missing kidId or chatId' }, { status: 400 });
  }

  const authError = getChildAuthErrorResponse(request, rawKidId);
  if (authError) return authError;

  const kidId = requireChildRequest(request, rawKidId);
  const chatId = requireKnownChatId(rawChatId);
  const task = await readFrenchWritingTask(kidId, chatId);
  const gate = await getKidTaskGate(kidId);
  const showTaskPanel = gate.hasAssignedTask || gate.hasCompletedTask;

  return NextResponse.json({ task, canStartTask: gate.canStartTask, hasAssignedTask: gate.hasAssignedTask, hasCompletedTask: gate.hasCompletedTask, showTaskPanel });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    kidId?: string;
    chatId?: string;
    topic?: string;
    targetWordCount?: number;
  };

  if (!body.kidId) {
    return NextResponse.json({ error: 'Missing kidId' }, { status: 400 });
  }

  const authError = getChildAuthErrorResponse(request, body.kidId);
  if (authError) return authError;

  const kidId = requireChildRequest(request, body.kidId);
  const result = await createAdminFrenchWritingTask({
    kidId,
    topic: body.topic,
    targetWordCount: body.targetWordCount,
  });

  return NextResponse.json(result);
}
