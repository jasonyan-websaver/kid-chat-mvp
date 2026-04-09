import { promises as fs } from 'fs';
import path from 'path';
import { AppError } from './app-error';
import { createFrenchWritingTask, readFrenchWritingTask } from './french-writing';
import { getConfiguredKidById } from './kid-settings';
import { findOrCreateFrenchTaskChat } from './openclaw';

function nowIso() {
  return new Date().toISOString();
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

export async function listKidTaskFiles(kidId: string) {
  const dir = path.join(process.cwd(), 'data', 'french-writing-tasks', kidId);
  try {
    const names = await fs.readdir(dir);
    return names.filter((name) => name.endsWith('.json'));
  } catch {
    return [] as string[];
  }
}

export async function listKidTasks(kidId: string) {
  const taskFiles = await listKidTaskFiles(kidId);
  const tasks = (await Promise.all(
    taskFiles.map(async (file) => readFrenchWritingTask(kidId, file.replace(/\.json$/i, '')))
  )).filter(Boolean);
  return tasks;
}

export async function getKidTaskGate(kidId: string) {
  const tasks = await listKidTasks(kidId);
  const hasAssignedTask = tasks.some((item) => item?.status === 'assigned');
  const hasCompletedTask = tasks.some((item) => item?.status === 'completed');
  const canStartTask = hasAssignedTask || !hasCompletedTask;
  return { tasks, hasAssignedTask, hasCompletedTask, canStartTask };
}

export async function resetKidTestData(kidId: string) {
  if (!['george', 'grace'].includes(kidId)) {
    throw new AppError('Unsupported kidId', 400);
  }

  const root = path.join(process.cwd(), 'data');
  const chatDir = path.join(root, 'chat-store', kidId);
  const taskDir = path.join(root, 'french-writing-tasks', kidId);
  const lastActivePath = path.join(root, 'last-active-chat.json');

  await fs.rm(chatDir, { recursive: true, force: true });
  await fs.rm(taskDir, { recursive: true, force: true });

  const lastActive = await readJsonFile<Record<string, string>>(lastActivePath, {});
  delete lastActive[kidId];
  await writeJsonFile(lastActivePath, lastActive);

  const result = await createAdminFrenchWritingTask({
    kidId,
    topic: 'rocket',
    targetWordCount: 20,
    force: true,
  });

  return {
    ok: true,
    message: `已重置 ${kidId} 的测试数据，并重建了一个新的测试任务。`,
    kidId,
    taskChatId: result.taskChatId,
    taskId: result.task.id,
  };
}

export async function createAdminFrenchWritingTask(params: {
  kidId: string;
  topic?: string;
  targetWordCount?: number;
  force?: boolean;
}) {
  const kid = await getConfiguredKidById(params.kidId);
  if (!kid) {
    throw new AppError('Unknown kid', 400);
  }

  const gate = await getKidTaskGate(params.kidId);
  if (!params.force && !gate.canStartTask) {
    throw new AppError('当前测试任务已完成。请先重置测试数据后再创建新任务。', 409);
  }

  const topicLabel = params.topic?.trim() ? `📝 Mission français · ${params.topic.trim()}` : '📝 Mission français';
  const taskChat = await findOrCreateFrenchTaskChat({ kidId: params.kidId, title: topicLabel });
  const existingTask = await readFrenchWritingTask(params.kidId, taskChat.chatId);
  const task = existingTask?.status === 'assigned'
    ? existingTask
    : await createFrenchWritingTask({
        kid,
        chatId: taskChat.chatId,
        topic: params.topic,
        targetWordCount: params.targetWordCount,
      });

  const root = path.join(process.cwd(), 'data');
  const lastActivePath = path.join(root, 'last-active-chat.json');
  const lastActive = await readJsonFile<Record<string, string>>(lastActivePath, {});
  lastActive[params.kidId] = taskChat.chatId;
  await writeJsonFile(lastActivePath, lastActive);

  const chatPath = path.join(root, 'chat-store', params.kidId, `${taskChat.chatId}.json`);
  const messages = await readJsonFile<Array<Record<string, unknown>>>(chatPath, []);
  const hasTaskMessage = messages.some((message) => (message as { meta?: { kind?: string } }).meta?.kind === 'french-writing-task');
  if (!hasTaskMessage) {
    messages.push({
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: `Nouveau défi d'écriture en français !\n\n${task.prompt}`,
      createdAt: nowIso(),
      meta: {
        kind: 'french-writing-task',
        taskId: task.id,
        taskStatus: task.status,
        taskTopic: task.topic,
        targetLength: task.targetWordCount,
      },
    });
    await writeJsonFile(chatPath, messages);
  }

  return {
    ok: true,
    kidId: params.kidId,
    taskChatId: taskChat.chatId,
    task,
    createdTaskChat: taskChat.created,
    message: `已为 ${kid.name} 创建任务：${task.topic}`,
  };
}
