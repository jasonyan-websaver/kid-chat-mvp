import { promises as fs } from 'fs';
import path from 'path';
import { AppError } from './app-error';
import { completeFrenchWritingTask, createFrenchWritingTask, readFrenchWritingTask } from './french-writing';
import { getConfiguredKidById } from './kid-settings';
import { getKidWorkspaceDir } from './kid-paths';
import { findOrCreateFrenchTaskChat } from './openclaw';
import { setLastActiveChatId } from './last-active-chat';

export type KidTaskInboxRecord = {
  id: string;
  type: 'french-writing';
  status: 'pending' | 'claimed' | 'completed' | 'archived';
  topic?: string;
  topicLabel?: string;
  targetWordCount?: number;
  rewardType?: 'image' | 'certificate' | 'message';
  rewardTheme?: string;
  instructions: string;
  createdBy?: string;
  createdAt: string;
};

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

export function getKidTaskDirs(kidId: string) {
  const workspaceDir = getKidWorkspaceDir(kidId);
  if (!workspaceDir) return null;

  const root = path.join(workspaceDir, 'tasks');
  return {
    root,
    inbox: path.join(root, 'inbox'),
    claimed: path.join(root, 'claimed'),
    completed: path.join(root, 'completed'),
    archived: path.join(root, 'archived'),
  };
}

export async function ensureKidTaskDirs(kidId: string) {
  const dirs = getKidTaskDirs(kidId);
  if (!dirs) {
    throw new AppError(`无法解析 ${kidId} 的 workspace 任务目录。`, 500);
  }

  await Promise.all([
    fs.mkdir(dirs.inbox, { recursive: true }),
    fs.mkdir(dirs.claimed, { recursive: true }),
    fs.mkdir(dirs.completed, { recursive: true }),
    fs.mkdir(dirs.archived, { recursive: true }),
  ]);

  return dirs;
}

export async function listInboxTasks(kidId: string): Promise<Array<{ fileName: string; filePath: string; task: KidTaskInboxRecord }>> {
  const dirs = await ensureKidTaskDirs(kidId);
  const names = await fs.readdir(dirs.inbox).catch(() => [] as string[]);
  const jsonNames = names.filter((name) => name.endsWith('.json')).sort();

  const results = await Promise.all(jsonNames.map(async (fileName) => {
    const filePath = path.join(dirs.inbox, fileName);
    const task = await readJsonFile<KidTaskInboxRecord | null>(filePath, null);
    return task ? { fileName, filePath, task } : null;
  }));

  return results.filter(Boolean) as Array<{ fileName: string; filePath: string; task: KidTaskInboxRecord }>;
}

export function buildInboxTask(params: {
  topic?: string;
  topicLabel?: string;
  targetWordCount?: number;
  rewardType?: 'image' | 'certificate' | 'message';
  rewardTheme?: string;
  createdBy?: string;
  instructions?: string;
}) {
  const topic = String(params.topic || 'rocket').trim() || 'rocket';
  const topicLabel = String(params.topicLabel || topic).trim() || topic;
  const targetWordCount = Number.isFinite(params.targetWordCount) ? Math.max(1, Math.floor(params.targetWordCount || 20)) : 20;
  const rewardType = params.rewardType || 'image';
  const rewardTheme = String(params.rewardTheme || topic || 'rocket').trim() || topic;
  const createdBy = String(params.createdBy || 'parent-admin').trim() || 'parent-admin';
  const instructions = String(
    params.instructions || `Écris un petit texte en français sur le thème « ${topicLabel} », avec environ ${targetWordCount} mots.`
  ).trim();

  return {
    id: `task-${Date.now()}`,
    type: 'french-writing' as const,
    status: 'pending' as const,
    topic,
    topicLabel,
    targetWordCount,
    rewardType,
    rewardTheme,
    instructions,
    createdBy,
    createdAt: nowIso(),
  };
}

export async function createInboxTask(params: {
  kidId: string;
  task: KidTaskInboxRecord;
}) {
  const dirs = await ensureKidTaskDirs(params.kidId);
  const fileName = `${params.task.id}.json`;
  const filePath = path.join(dirs.inbox, fileName);
  await writeJsonFile(filePath, params.task);
  return { fileName, filePath, task: params.task };
}

export async function claimNextInboxTask(kidId: string) {
  const dirs = await ensureKidTaskDirs(kidId);
  const entries = await listInboxTasks(kidId);
  const next = entries.find((entry) => entry.task.status === 'pending');
  if (!next) return null;

  const claimedRecord: KidTaskInboxRecord = {
    ...next.task,
    status: 'claimed',
  };
  const claimedPath = path.join(dirs.claimed, next.fileName);
  await writeJsonFile(claimedPath, claimedRecord);
  await fs.rm(next.filePath, { force: true });
  return { ...next, claimedPath, task: claimedRecord };
}

export async function moveClaimedTaskToCompleted(kidId: string, matcher: { topic?: string; instructions?: string }) {
  const dirs = await ensureKidTaskDirs(kidId);
  const names = await fs.readdir(dirs.claimed).catch(() => [] as string[]);

  for (const name of names.filter((item) => item.endsWith('.json'))) {
    const claimedPath = path.join(dirs.claimed, name);
    const task = await readJsonFile<KidTaskInboxRecord | null>(claimedPath, null);
    if (!task) continue;
    const matchesTopic = matcher.topic && task.topic === matcher.topic;
    const matchesInstructions = matcher.instructions && task.instructions === matcher.instructions;
    if (!matchesTopic && !matchesInstructions) continue;

    const completedTask: KidTaskInboxRecord = { ...task, status: 'completed' };
    const completedPath = path.join(dirs.completed, name);
    await writeJsonFile(completedPath, completedTask);
    await fs.rm(claimedPath, { force: true });
    return { completedPath, task: completedTask };
  }

  return null;
}

export async function moveTaskBetweenStates(params: {
  kidId: string;
  taskId: string;
  from: 'pending' | 'claimed' | 'completed' | 'archived';
  to: 'pending' | 'claimed' | 'completed' | 'archived';
}) {
  const dirs = await ensureKidTaskDirs(params.kidId);
  const dirMap = {
    pending: dirs.inbox,
    claimed: dirs.claimed,
    completed: dirs.completed,
    archived: dirs.archived,
  } as const;

  const fileName = `${params.taskId}.json`;
  const sourcePath = path.join(dirMap[params.from], fileName);
  const targetPath = path.join(dirMap[params.to], fileName);
  const task = await readJsonFile<KidTaskInboxRecord | null>(sourcePath, null);

  if (!task) {
    throw new AppError(`未找到任务 ${params.taskId}。`, 404);
  }

  const nextTask: KidTaskInboxRecord = {
    ...task,
    status: params.to,
  };

  await writeJsonFile(targetPath, nextTask);
  await fs.rm(sourcePath, { force: true });
  return nextTask;
}

export async function deleteTaskByState(params: {
  kidId: string;
  taskId: string;
  from: 'pending' | 'claimed' | 'completed' | 'archived';
}) {
  const dirs = await ensureKidTaskDirs(params.kidId);
  const dirMap = {
    pending: dirs.inbox,
    claimed: dirs.claimed,
    completed: dirs.completed,
    archived: dirs.archived,
  } as const;

  const fileName = `${params.taskId}.json`;
  const targetPath = path.join(dirMap[params.from], fileName);
  const task = await readJsonFile<KidTaskInboxRecord | null>(targetPath, null);
  if (!task) {
    throw new AppError(`未找到任务 ${params.taskId}。`, 404);
  }

  await fs.rm(targetPath, { force: true });
  return task;
}

export async function importInboxTaskToKidChat(kidId: string) {
  const claimed = await claimNextInboxTask(kidId);
  if (!claimed) return null;

  const kid = await getConfiguredKidById(kidId);
  if (!kid) {
    throw new AppError('Unknown kid', 400);
  }

  if (claimed.task.type !== 'french-writing') {
    throw new AppError(`暂不支持的任务类型：${claimed.task.type}`, 400);
  }

  const title = claimed.task.topic?.trim()
    ? `📝 Mission français · ${claimed.task.topic.trim()}`
    : '📝 Mission français';

  const existingAssignedEntries = await fs.readdir(path.join(process.cwd(), 'data', 'french-writing-tasks', kidId)).catch(() => [] as string[]);
  for (const name of existingAssignedEntries.filter((item) => item.endsWith('.json'))) {
    const task = await readFrenchWritingTask(kidId, name.replace(/\.json$/i, ''));
    if (task?.status === 'assigned') {
      await completeFrenchWritingTask(task);
    }
  }

  const taskChat = await findOrCreateFrenchTaskChat({ kidId, title });
  const existingTask = await readFrenchWritingTask(kidId, taskChat.chatId);
  const createdTask = existingTask?.status === 'assigned'
    ? existingTask
    : await createFrenchWritingTask({
        kid,
        chatId: taskChat.chatId,
        topic: claimed.task.topic || claimed.task.topicLabel,
        targetWordCount: claimed.task.targetWordCount,
      });

  const claimedChatPath = path.join(process.cwd(), 'data', 'chat-store', kidId, `${taskChat.chatId}.json`);
  const messages = await readJsonFile<Array<Record<string, unknown>>>(claimedChatPath, []);
  const hasTaskMessage = messages.some((message) => (message as { meta?: { kind?: string } }).meta?.kind === 'french-writing-task');
  if (!hasTaskMessage) {
    messages.push({
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: `Nouveau défi d'écriture en français !\n\n${claimed.task.instructions || createdTask.prompt}`,
      createdAt: nowIso(),
      meta: {
        kind: 'french-writing-task',
        taskId: createdTask.id,
        taskStatus: createdTask.status,
        taskTopic: createdTask.topic,
        targetLength: createdTask.targetWordCount,
      },
    });
    await writeJsonFile(claimedChatPath, messages);
  }

  await setLastActiveChatId(kidId, taskChat.chatId);

  return {
    taskChatId: taskChat.chatId,
    task: createdTask,
    inboxTask: claimed.task,
    claimedPath: claimed.claimedPath,
  };
}
