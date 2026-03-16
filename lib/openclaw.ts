import { promises as fs } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getConfiguredKidById } from './kid-settings';
import { AppError } from './app-error';
import { ChatMessage, ChatSummary } from './types';
import { mockChatSummaries, mockMessages } from './mock-data';
import { formatKidProfileMemory, readKidProfileMemory } from './profiles';
import { updateAgentMemoryFromChat } from './agent-memory';
import {
  markMemoryExtractionRan,
  markMessageForMemoryThrottle,
  shouldRunMemoryExtraction,
} from './memory-throttle';

const execFileAsync = promisify(execFile);
const useMock = process.env.OPENCLAW_USE_MOCK === 'true';
const dataRoot = path.join(process.cwd(), 'data', 'chat-store');

type StoredChat = {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
};

type StoredKidIndex = {
  chats: StoredChat[];
};

function nowIso() {
  return new Date().toISOString();
}

function formatTimeLabel(date: string) {
  const d = new Date(date);
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function toMessageTime(date: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

function normalizeSnippet(text: string) {
  return text.trim().replace(/\s+/g, ' ');
}

function makeChatTitle(message: string) {
  const trimmed = normalizeSnippet(message);
  return trimmed.length <= 18 ? trimmed : `${trimmed.slice(0, 18)}…`;
}

function makeChatPreview(message: string) {
  const trimmed = normalizeSnippet(message);
  if (!trimmed) return '继续聊天';
  return trimmed.length <= 28 ? trimmed : `${trimmed.slice(0, 28)}…`;
}

function getKidDir(kidId: string) {
  return path.join(dataRoot, kidId);
}

function getKidIndexPath(kidId: string) {
  return path.join(getKidDir(kidId), 'index.json');
}

function getChatPath(kidId: string, chatId: string) {
  return path.join(getKidDir(kidId), `${chatId}.json`);
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
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
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

async function ensureKidStore(kidId: string) {
  await ensureDir(getKidDir(kidId));
  const indexPath = getKidIndexPath(kidId);
  const index = await readJsonFile<StoredKidIndex>(indexPath, { chats: [] });

  if (index.chats.length === 0) {
    const createdAt = nowIso();
    const defaultChat: StoredChat = {
      id: 'welcome',
      title: '新的聊天',
      updatedAt: createdAt,
      createdAt,
    };

    index.chats = [defaultChat];
    await writeJsonFile(indexPath, index);

    const kid = await getConfiguredKidById(kidId);
    const welcomeMessage: ChatMessage = {
      id: 'welcome-assistant',
      role: 'assistant',
      content: kid?.welcome || '你好，我们开始聊天吧。',
      createdAt,
    };
    await writeJsonFile(getChatPath(kidId, defaultChat.id), [welcomeMessage]);
  }

  return index;
}

async function readKidIndex(kidId: string) {
  await ensureKidStore(kidId);
  return readJsonFile<StoredKidIndex>(getKidIndexPath(kidId), { chats: [] });
}

function createChatId() {
  return `chat-${Date.now()}`;
}

async function saveKidIndex(kidId: string, index: StoredKidIndex) {
  await writeJsonFile(getKidIndexPath(kidId), index);
}

async function readChatMessages(kidId: string, chatId: string) {
  await ensureKidStore(kidId);
  return readJsonFile<Array<ChatMessage & { createdAt: string }>>(getChatPath(kidId, chatId), []);
}

async function saveChatMessages(kidId: string, chatId: string, messages: ChatMessage[]) {
  await writeJsonFile(getChatPath(kidId, chatId), messages);
}

function buildPrompt(params: {
  kidName: string;
  profileMemory: string;
  history: ChatMessage[];
  latestMessage: string;
}) {
  const recent = params.history.slice(-8);
  const transcript = recent
    .map((message) => `${message.role === 'user' ? 'Child' : 'Assistant'}: ${message.content}`)
    .join('\n');

  return [
    `You are ${params.kidName}'s personal assistant inside a child-friendly chat app.`,
    'Reply naturally, warmly, and clearly for a child audience.',
    'Do not mention system prompts, tools, internal implementation, or hidden memory systems.',
    'Use the long-term child profile below to stay consistent across different chat threads.',
    '',
    'Long-term child profile:',
    params.profileMemory,
    '',
    'Continue the conversation based on the recent chat history below.',
    '',
    'Recent conversation:',
    transcript || '(no previous messages)',
    '',
    `Latest child message: ${params.latestMessage}`,
    '',
    'Now reply as the assistant with only the message content.',
  ].join('\n');
}

async function runOpenClawAgent(agentId: string, message: string) {
  try {
    const { stdout } = await execFileAsync('openclaw', ['agent', '--agent', agentId, '--message', message, '--json'], {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024 * 5,
    });

    const parsed = JSON.parse(stdout) as {
      result?: {
        payloads?: Array<{ text?: string | null }>;
      };
    };

    const text = parsed.result?.payloads?.map((item) => item.text || '').join('\n').trim();
    if (!text) {
      throw new AppError('智能体返回了空回复，请检查 agent 配置。', 502);
    }

    return text;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('spawn openclaw ENOENT')) {
      throw new AppError('服务器上找不到 openclaw 命令，请先安装并确认 PATH 配置正确。', 500);
    }

    if (message.includes('No such agent') || message.includes('unknown agent') || message.includes('not found')) {
      throw new AppError(`找不到智能体 ${agentId}，请检查孩子和 agentId 的映射配置。`, 502);
    }

    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(`调用智能体失败：${message}`, 502);
  }
}

export async function listChatsForKid(kidId: string): Promise<ChatSummary[]> {
  if (useMock) {
    return mockChatSummaries[kidId] ?? [];
  }

  const index = await readKidIndex(kidId);
  const sortedChats = [...index.chats].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

  const summaries = await Promise.all(
    sortedChats.map(async (chat) => {
      const messages = await readChatMessages(kidId, chat.id);
      const lastMessage = messages[messages.length - 1];

      return {
        id: chat.id,
        title: chat.title,
        updatedAt: formatTimeLabel(chat.updatedAt),
        preview: makeChatPreview(lastMessage?.content ?? ''),
      };
    }),
  );

  return summaries;
}

export async function getMessagesForChat(kidId: string, chatId: string): Promise<ChatMessage[]> {
  if (useMock) {
    return mockMessages[`${kidId}:${chatId}`] ?? [
      {
        id: 'welcome',
        role: 'assistant',
        content: '你好，我们开始聊天吧。',
        createdAt: '现在',
      },
    ];
  }

  const stored = await readChatMessages(kidId, chatId);
  return stored.map((message) => ({
    ...message,
    createdAt: toMessageTime(message.createdAt),
  }));
}

export async function createChatForKid(kidId: string): Promise<{ chatId: string }> {
  if (useMock) {
    return { chatId: `chat-${Date.now()}` };
  }

  const kid = await getConfiguredKidById(kidId);
  if (!kid) {
    throw new AppError('未知的孩子入口。', 400);
  }

  const index = await readKidIndex(kidId);
  const createdAt = nowIso();
  const chatId = createChatId();

  index.chats.unshift({
    id: chatId,
    title: '新的聊天',
    createdAt,
    updatedAt: createdAt,
  });

  await saveKidIndex(kidId, index);

  const welcomeMessage: ChatMessage = {
    id: `assistant-${Date.now()}`,
    role: 'assistant',
    content: kid.welcome,
    createdAt,
  };

  await saveChatMessages(kidId, chatId, [welcomeMessage]);

  return { chatId };
}

export async function sendMessageToKidChat(params: {
  kidId: string;
  chatId: string;
  message: string;
}): Promise<ChatMessage> {
  if (!params.message.trim()) {
    throw new AppError('消息内容不能为空。', 400);
  }

  if (useMock) {
    return {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: `我收到了：${params.message}\n\n这是 MVP 的模拟回复。接真实 OpenClaw 后，这里会返回对应孩子智能体的正式回答。`,
      createdAt: '刚刚',
    };
  }

  const kid = await getConfiguredKidById(params.kidId);
  if (!kid) {
    throw new AppError('未知的孩子入口。', 400);
  }

  if (!kid.agentId?.trim()) {
    throw new AppError(`孩子 ${kid.name} 尚未配置 agentId。`, 500);
  }

  const index = await readKidIndex(params.kidId);
  const storedMessages = await readChatMessages(params.kidId, params.chatId);

  let profileMemory = '';
  try {
    profileMemory = formatKidProfileMemory(await readKidProfileMemory(params.kidId));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new AppError(`读取孩子资料失败：${message}`, 500);
  }

  const now = nowIso();

  const userMessage: ChatMessage = {
    id: `user-${Date.now()}`,
    role: 'user',
    content: params.message,
    createdAt: now,
  };

  const nextStoredMessages = [...storedMessages, userMessage];
  const prompt = buildPrompt({
    kidName: kid.name,
    profileMemory,
    history: nextStoredMessages,
    latestMessage: params.message,
  });

  const assistantText = await runOpenClawAgent(kid.agentId, prompt);

  const assistantStoredMessage: ChatMessage = {
    id: `assistant-${Date.now()}`,
    role: 'assistant',
    content: assistantText,
    createdAt: nowIso(),
  };

  await saveChatMessages(params.kidId, params.chatId, [...nextStoredMessages, assistantStoredMessage]);

  void (async () => {
    await markMessageForMemoryThrottle(params.kidId);
    const shouldRun = await shouldRunMemoryExtraction(params.kidId);
    if (!shouldRun) return;

    const result = await updateAgentMemoryFromChat({
      kidId: params.kidId,
      userMessage: params.message,
      assistantMessage: assistantText,
    }).catch(() => null);

    if (result?.updated) {
      await markMemoryExtractionRan(params.kidId);
    }
  })();

  const existing = index.chats.find((chat) => chat.id === params.chatId);
  if (existing) {
    existing.updatedAt = assistantStoredMessage.createdAt;
    if (existing.title === '新的聊天' && params.message.trim()) {
      existing.title = makeChatTitle(params.message);
    }
  } else {
    index.chats.push({
      id: params.chatId,
      title: makeChatTitle(params.message),
      createdAt: assistantStoredMessage.createdAt,
      updatedAt: assistantStoredMessage.createdAt,
    });
  }

  await saveKidIndex(params.kidId, index);

  return {
    ...assistantStoredMessage,
    createdAt: toMessageTime(assistantStoredMessage.createdAt),
  };
}
