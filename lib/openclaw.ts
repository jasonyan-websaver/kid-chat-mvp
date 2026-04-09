import { promises as fs } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getConfiguredKidById } from './kid-settings';
import { AppError } from './app-error';
import { getErrorSummary, logError, logInfo, maskIdentifier, summarizeText } from './observability';
import { normalizeKnownChatId, normalizeKnownKidId } from './storage-ids';
import { ChatAttachment, ChatMessage, ChatSummary, getMessageAttachments } from './types';
import {
  analyzeUploadedImageForMvp,
  buildImageUnderstandingPrompt,
  buildUploadedImageAttachment,
  detectMultimodalIntent,
} from './multimodal';
import { analyzeUploadedImageViaGateway } from './gateway-chat-completions';
import { mockChatSummaries, mockMessages } from './mock-data';
import { updateAgentMemoryFromChat } from './agent-memory';
import { generateImage } from './image-generation';
import { saveGeneratedChatImage } from './upload';
import { moveClaimedTaskToCompleted } from './kid-task-inbox';
import { clearKidReminder, readKidReminder } from './reminders';
import {
  markMemoryExtractionRan,
  markMessageForMemoryThrottle,
  shouldRunMemoryExtraction,
} from './memory-throttle';
import { setLastActiveChatId } from './last-active-chat';
import { evaluateFrenchWritingTask, looksLikeFrenchWritingSubmission, readFrenchWritingTask } from './french-writing';

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

function stripMarkdownForPlainText(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^\)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^\)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6})\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*([-*+]|\d+\.)\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/\|/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeSnippet(text: string) {
  return stripMarkdownForPlainText(text).trim().replace(/\s+/g, ' ');
}

function detectReplyLanguage(text: string): 'zh' | 'fr' | 'en' {
  if (/[\u4e00-\u9fff]/.test(text)) return 'zh';
  if (/[àâçéèêëîïôûùüÿœæ]/i.test(text) || /\b(le|la|les|un|une|des|bonjour|salut|pourquoi|comment|dessine|génère|image)\b/i.test(text)) {
    return 'fr';
  }
  return 'en';
}

function buildImageGenerationReplyText(language: 'zh' | 'fr' | 'en', prompt: string, description?: string) {
  const cleanDescription = description?.trim() || '';

  if (language === 'zh') {
    if (cleanDescription && /[\u4e00-\u9fff]/.test(cleanDescription)) {
      return cleanDescription;
    }
    return `我按照你的想法生成了一张图片：${prompt}`;
  }

  if (language === 'fr') {
    if (cleanDescription && (/[àâçéèêëîïôûùüÿœæ]/i.test(cleanDescription) || /\b(le|la|les|un|une|des|bonjour|salut|image|voici)\b/i.test(cleanDescription))) {
      return cleanDescription;
    }
    return `J'ai généré une image selon ta demande : ${prompt}`;
  }

  return cleanDescription || `I generated an image based on your request: ${prompt}`;
}

function extractInlineImageGenerationPrompt(text: string): { cleanedText: string; prompt?: string } {
  const match = text.match(/\[\[image_generated:\s*([\s\S]*?)\]\]/i);
  if (!match) {
    return { cleanedText: text.trim() };
  }

  const prompt = match[1]?.trim();
  const cleanedText = text.replace(match[0], '').replace(/\n{3,}/g, '\n\n').trim();
  return {
    cleanedText,
    prompt: prompt || undefined,
  };
}

function makeChatTitle(message: string) {
  const trimmed = normalizeSnippet(message);
  return trimmed.length <= 18 ? trimmed : `${trimmed.slice(0, 18)}…`;
}

function buildTaskLabel(mode: 'chat' | 'image_understanding' | 'image_generation' | 'image_edit', message: string) {
  const trimmed = normalizeSnippet(message);
  const snippet = trimmed || (mode === 'image_generation' ? '新图片' : mode === 'image_edit' ? '修改图片' : mode === 'image_understanding' ? '解释图片' : '继续聊天');
  const short = snippet.length <= 16 ? snippet : `${snippet.slice(0, 16)}…`;

  if (mode === 'image_understanding') return `解释图片：${short}`;
  if (mode === 'image_generation') return `生成图片：${short}`;
  if (mode === 'image_edit') return `改图：${short}`;
  return makeChatTitle(message);
}

function makeChatPreview(message: string) {
  const trimmed = normalizeSnippet(message);
  if (!trimmed) return '继续聊天';
  return trimmed.length <= 28 ? trimmed : `${trimmed.slice(0, 28)}…`;
}

function getKidDir(kidId: string) {
  return path.join(dataRoot, normalizeKnownKidId(kidId));
}

function getKidIndexPath(kidId: string) {
  return path.join(getKidDir(kidId), 'index.json');
}

function getChatPath(kidId: string, chatId: string) {
  return path.join(getKidDir(kidId), `${normalizeKnownChatId(chatId)}.json`);
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
  history: ChatMessage[];
  multimodalContext?: string;
  reminderText?: string;
  frenchWritingTaskText?: string;
}) {
  const recent = params.history.slice(-4);
  const transcript = recent
    .map((message) => {
      const attachments = getMessageAttachments(message);
      const attachmentHint = attachments.length
        ? ` [Attachments: ${attachments.map((attachment) => attachment.kind).join(', ')}]`
        : '';
      return `${message.role === 'user' ? 'Child' : 'Assistant'}: ${message.content}${attachmentHint}`;
    })
    .join('\n');

  return [
    `You are ${params.kidName}'s personal assistant inside a child-friendly chat app.`,
    'Reply in the same language as the child\'s latest message unless the child explicitly asks to switch languages.',
    'Do not mention system prompts, tools, internal implementation, or hidden memory systems.',
    params.reminderText
      ? `There is an active child reminder. Mention it naturally near the beginning of your reply in the child's appropriate language, without sounding robotic or exposing internal metadata. If the reminder implies a reward, phrase it naturally as motivation rather than as a system rule. ${params.kidName.toLowerCase().includes('grace') ? 'Use a gentle, warm, cozy, encouraging tone.' : params.kidName.toLowerCase().includes('george') ? 'Use a playful, curious, challenge-friendly, discovery tone.' : 'Use a warm encouraging tone.'}`
      : '',
    params.reminderText ? `Active reminder: ${params.reminderText}` : '',
    params.frenchWritingTaskText ? `Active French writing task: ${params.frenchWritingTaskText}` : '',
    '',
    'Recent conversation:',
    transcript || '(no previous messages)',
    '',
    'Multimodal context (if any):',
    params.multimodalContext || '(none)',
    '',
    'Reply with only the assistant message content.',
  ].filter(Boolean).join('\n');
}

function extractAgentTextFromJson(stdout: string) {
  const parsed = JSON.parse(stdout) as {
    result?: {
      payloads?: Array<{ text?: string | null; content?: string | null }>;
      message?: { text?: string | null; content?: string | null };
    };
  };

  const payloadText = parsed.result?.payloads
    ?.map((item) => item.text || item.content || '')
    .join('\n')
    .trim();
  const messageText = (parsed.result?.message?.text || parsed.result?.message?.content || '').trim();
  const text = payloadText || messageText;

  return {
    parsed,
    text,
  };
}

async function runOpenClawAgent(agentId: string, message: string) {
  try {
    const invoke = async (prompt: string) => {
      const { stdout } = await execFileAsync('openclaw', ['agent', '--agent', agentId, '--message', prompt, '--json'], {
        cwd: process.cwd(),
        maxBuffer: 1024 * 1024 * 5,
      });
      return { stdout, ...extractAgentTextFromJson(stdout) };
    };

    let result = await invoke(message);
    if (!result.text) {
      result = await invoke(`${message}\n\nReply with a short plain-text answer for the child. Do not return an empty response.`);
    }

    if (!result.text) {
      const debugSummary = JSON.stringify(result.parsed?.result || {}, null, 2).slice(0, 600);
      throw new AppError(`智能体返回了空回复，请检查 agent 配置。返回摘要：${debugSummary}`, 502);
    }

    return result.text;
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
  const visibleChats = index.chats.filter((chat) => chat.id !== 'welcome');
  const sortedChats = [...visibleChats].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

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

  const resolvedChatId = chatId === 'welcome'
    ? ((await readKidIndex(kidId)).chats.find((chat) => chat.id !== 'welcome')?.id || chatId)
    : chatId;

  const stored = await readChatMessages(kidId, resolvedChatId);
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

export async function findOrCreateFrenchTaskChat(params: {
  kidId: string;
  title?: string;
}): Promise<{ chatId: string; created: boolean }> {
  const index = await readKidIndex(params.kidId);

  for (const chat of index.chats) {
    if (!chat.title.startsWith('📝 ')) continue;
    const existingTask = await readFrenchWritingTask(params.kidId, chat.id);
    if (existingTask?.status === 'assigned') {
      return { chatId: chat.id, created: false };
    }
  }

  const kid = await getConfiguredKidById(params.kidId);
  if (!kid) {
    throw new AppError('未知的孩子入口。', 400);
  }

  const createdAt = nowIso();
  const chatId = createChatId();
  const title = params.title?.trim() || '📝 Mission de français';

  index.chats.unshift({
    id: chatId,
    title,
    createdAt,
    updatedAt: createdAt,
  });

  await saveKidIndex(params.kidId, index);

  const welcomeMessage: ChatMessage = {
    id: `assistant-${Date.now()}`,
    role: 'assistant',
    content: kid.welcome,
    createdAt,
  };

  await saveChatMessages(params.kidId, chatId, [welcomeMessage]);
  return { chatId, created: true };
}

export async function sendMessageToKidChat(params: {
  kidId: string;
  chatId: string;
  message: string;
  mode?: 'chat' | 'image_generation' | 'image_understanding' | 'image_edit';
  image?: { url: string; filePath: string; contentType?: string };
  requestId?: string;
}): Promise<ChatMessage> {
  if (!params.message.trim() && !params.image) {
    throw new AppError('消息内容不能为空。', 400);
  }

  if (useMock) {
    return {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: params.image
        ? `我看到了你发来的图片${params.message ? `，还有这句话：${params.message}` : ''}。\n\n这是图片输入 MVP 的模拟回复。下一步接上真实视觉理解后，我就能真正根据图片内容来回答你。`
        : `我收到了：${params.message}\n\n这是 MVP 的模拟回复。接真实 OpenClaw 后，这里会返回对应孩子智能体的正式回答。`,
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

  const now = nowIso();
  const uploadedAttachments: ChatAttachment[] = params.image ? [buildUploadedImageAttachment(params.image, params.message)] : [];

  const userMessage: ChatMessage = {
    id: `user-${Date.now()}`,
    role: 'user',
    content: params.message || (params.image ? '请看看这张图片。' : ''),
    createdAt: now,
    attachments: uploadedAttachments.length ? uploadedAttachments : undefined,
    attachment: params.image
      ? {
          type: 'image',
          url: params.image.url,
          contentType: params.image.contentType,
        }
      : undefined,
  };

  const nextStoredMessages = [...storedMessages, userMessage];
  const detectedPlan = detectMultimodalIntent({
    message: params.message,
    uploadedAttachments,
    history: storedMessages,
  });
  const multimodalPlan = params.mode && params.mode !== 'chat'
    ? {
        intent: params.mode,
        uploadedAttachments,
        imageGenerationPrompt: params.mode === 'image_generation' || params.mode === 'image_edit'
          ? (params.message.trim() || undefined)
          : undefined,
      }
    : detectedPlan;

  const capabilities = kid.capabilities || {
    imageGeneration: true,
    imageUnderstanding: true,
    imageEdit: false,
  };

  logInfo('kid_chat.message.start', {
    requestId: params.requestId,
    kidId: maskIdentifier(params.kidId),
    chatId: maskIdentifier(params.chatId),
    requestedMode: params.mode || 'auto',
    resolvedIntent: multimodalPlan.intent,
    hasImage: Boolean(params.image),
    imageContentType: params.image?.contentType || null,
    imageFilePath: params.image?.filePath || null,
    imageUrl: params.image?.url || null,
    messagePreview: summarizeText(params.message, 120),
    capabilities,
    agentId: kid.agentId,
  });

  let multimodalContext = '';
  if (multimodalPlan.intent === 'image_understanding') {
    if (!capabilities.imageUnderstanding) {
      throw new AppError('这个聊天入口暂时不支持图片解释。', 403);
    }
    if (!params.image) {
      throw new AppError('请先上传一张图片，再让助手帮你解释。', 400);
    }
  }

  if (multimodalPlan.intent === 'image_generation' && !capabilities.imageGeneration) {
    throw new AppError('这个聊天入口暂时不支持生成图片。', 403);
  }

  if (multimodalPlan.intent === 'image_edit') {
    if (!capabilities.imageEdit) {
      throw new AppError('这个聊天入口暂时不支持改图。', 403);
    }
    if (!params.image) {
      throw new AppError('请先上传一张参考图片，再进行改图。', 400);
    }
  }

  if (multimodalPlan.intent === 'image_understanding' && params.image) {
    try {
      logInfo('kid_chat.image_understanding.start', {
        requestId: params.requestId,
        kidId: maskIdentifier(params.kidId),
        chatId: maskIdentifier(params.chatId),
        agentId: kid.agentId,
        imageContentType: params.image.contentType || 'application/octet-stream',
        imageFilePath: params.image.filePath,
        latestMessagePreview: summarizeText(params.message, 120),
      });

      const analysis = await analyzeUploadedImageForMvp({
        filePath: params.image.filePath,
        contentType: params.image.contentType,
        latestMessage: params.message,
        analyzer: async ({ filePath, contentType, latestMessage }) =>
          analyzeUploadedImageViaGateway({
            agentId: kid.agentId,
            filePath,
            contentType,
            latestMessage,
            kidName: kid.name,
            requestId: params.requestId,
          }),
      });

      logInfo('kid_chat.image_understanding.success', {
        requestId: params.requestId,
        kidId: maskIdentifier(params.kidId),
        chatId: maskIdentifier(params.chatId),
        confidence: analysis.confidence,
        objectCount: analysis.objects?.length || 0,
        visibleTextCount: analysis.visibleText?.length || 0,
        summaryPreview: summarizeText(analysis.summary, 160),
      });

      userMessage.attachments = uploadedAttachments.map((attachment) =>
        attachment.kind === 'image_input'
          ? {
              ...attachment,
              analysis,
            }
          : attachment,
      );

      nextStoredMessages[nextStoredMessages.length - 1] = userMessage;
      multimodalContext = buildImageUnderstandingPrompt({
        kidName: kid.name,
        latestMessage: params.message,
        analysis,
      });
    } catch (error) {
      logError('kid_chat.image_understanding.failed', {
        requestId: params.requestId,
        kidId: maskIdentifier(params.kidId),
        chatId: maskIdentifier(params.chatId),
        agentId: kid.agentId,
        error: getErrorSummary(error),
      });
      throw error;
    }
  }

  if (multimodalPlan.intent === 'image_generation') {
    const generation = await generateImage({
      prompt: multimodalPlan.imageGenerationPrompt || params.message,
    });

    const savedImages = await Promise.all(
      generation.images.map((imageUrl) =>
        saveGeneratedChatImage({
          kidId: params.kidId,
          chatId: params.chatId,
          imageUrl,
        }),
      ),
    );

    const language = detectReplyLanguage(params.message);
    const assistantStoredMessage: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: buildImageGenerationReplyText(language, multimodalPlan.imageGenerationPrompt || params.message, generation.description),
      createdAt: nowIso(),
      attachments: savedImages.map((image) => ({
        kind: 'image_generated' as const,
        url: image.publicUrl,
        contentType: image.contentType,
        source: 'generated' as const,
        prompt: multimodalPlan.imageGenerationPrompt || params.message,
        revisedPrompt: generation.revisedPrompt,
        generationStatus: 'completed' as const,
        provider: generation.provider,
        model: generation.model,
      })),
    };

    await saveChatMessages(params.kidId, params.chatId, [...nextStoredMessages, assistantStoredMessage]);
    const existing = index.chats.find((chat) => chat.id === params.chatId);
    if (existing) {
      existing.updatedAt = assistantStoredMessage.createdAt;
      if (existing.title === '新的聊天') {
        existing.title = buildTaskLabel('image_generation', multimodalPlan.imageGenerationPrompt || params.message);
      }
    } else {
      index.chats.push({
        id: params.chatId,
        title: buildTaskLabel('image_generation', multimodalPlan.imageGenerationPrompt || params.message),
        createdAt: assistantStoredMessage.createdAt,
        updatedAt: assistantStoredMessage.createdAt,
      });
    }
    await saveKidIndex(params.kidId, index);
    await setLastActiveChatId(params.kidId, params.chatId);
    return {
      ...assistantStoredMessage,
      createdAt: toMessageTime(assistantStoredMessage.createdAt),
    };
  }

  if (multimodalPlan.intent === 'image_edit') {
    const generation = await generateImage({
      prompt: multimodalPlan.imageGenerationPrompt || params.message,
      referenceImages: params.image
        ? [{
            filePath: params.image.filePath,
            url: params.image.url,
            contentType: params.image.contentType,
          }]
        : undefined,
    });

    const savedImages = await Promise.all(
      generation.images.map((imageUrl) =>
        saveGeneratedChatImage({
          kidId: params.kidId,
          chatId: params.chatId,
          imageUrl,
        }),
      ),
    );

    const language = detectReplyLanguage(params.message);
    const assistantStoredMessage: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: buildImageGenerationReplyText(language, multimodalPlan.imageGenerationPrompt || params.message, generation.description),
      createdAt: nowIso(),
      attachments: [
        ...(params.image
          ? [{
              kind: 'image_input' as const,
              url: params.image.url,
              contentType: params.image.contentType,
              source: 'reference' as const,
              prompt: params.message || undefined,
            }]
          : []),
        ...savedImages.map((image) => ({
          kind: 'image_generated' as const,
          url: image.publicUrl,
          contentType: image.contentType,
          source: 'generated' as const,
          prompt: multimodalPlan.imageGenerationPrompt || params.message,
          revisedPrompt: generation.revisedPrompt,
          generationStatus: 'completed' as const,
          provider: generation.provider,
          model: generation.model,
        })),
      ],
    };

    await saveChatMessages(params.kidId, params.chatId, [...nextStoredMessages, assistantStoredMessage]);
    const existing = index.chats.find((chat) => chat.id === params.chatId);
    if (existing) {
      existing.updatedAt = assistantStoredMessage.createdAt;
      if (existing.title === '新的聊天') {
        existing.title = buildTaskLabel('image_edit', multimodalPlan.imageGenerationPrompt || params.message);
      }
    } else {
      index.chats.push({
        id: params.chatId,
        title: buildTaskLabel('image_edit', multimodalPlan.imageGenerationPrompt || params.message),
        createdAt: assistantStoredMessage.createdAt,
        updatedAt: assistantStoredMessage.createdAt,
      });
    }
    await saveKidIndex(params.kidId, index);
    await setLastActiveChatId(params.kidId, params.chatId);
    return {
      ...assistantStoredMessage,
      createdAt: toMessageTime(assistantStoredMessage.createdAt),
    };
  }

  const activeReminder = await readKidReminder(params.kidId);
  const activeFrenchWritingTask = params.chatId === 'welcome'
    ? null
    : await readFrenchWritingTask(params.kidId, params.chatId);

  const trimmedSubmission = params.message.trim();
  const shouldEvaluateFrenchWritingTask = Boolean(
    activeFrenchWritingTask?.status === 'assigned'
      && trimmedSubmission
      && trimmedSubmission.length >= 12
      && /[.!?\n]/.test(trimmedSubmission)
      && looksLikeFrenchWritingSubmission(trimmedSubmission),
  );

  if (shouldEvaluateFrenchWritingTask) {
    try {
      const evaluation = await evaluateFrenchWritingTask({
        kid,
        chatId: params.chatId,
        submissionText: trimmedSubmission,
      });

      const evaluationText = evaluation.task.evaluation?.completed
        ? `Bravo ! Tu as réussi ton défi d'écriture en français sur le thème « ${evaluation.task.topic} ». Voici ta magnifique image-récompense.`
        : `J'ai lu ton texte. ${evaluation.task.evaluation?.reason || "Il manque encore un petit peu."} Tu peux réessayer !`;

      const assistantStoredMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: evaluationText,
        createdAt: nowIso(),
        attachments: evaluation.rewardAttachments.length ? evaluation.rewardAttachments : undefined,
        meta: {
          kind: evaluation.task.evaluation?.completed ? 'french-writing-reward' : 'french-writing-evaluation',
          taskId: evaluation.task.id,
          taskStatus: evaluation.task.status,
          taskTopic: evaluation.task.topic,
          targetLength: evaluation.task.targetWordCount,
          completed: Boolean(evaluation.task.evaluation?.completed),
        },
      };

      await saveChatMessages(params.kidId, params.chatId, [...nextStoredMessages, assistantStoredMessage]);

      const existing = index.chats.find((chat) => chat.id === params.chatId);
      if (existing) {
        existing.updatedAt = assistantStoredMessage.createdAt;
        if (existing.title === '新的聊天' && params.message.trim()) {
          existing.title = buildTaskLabel('chat', params.message);
        }
      } else {
        index.chats.push({
          id: params.chatId,
          title: buildTaskLabel('chat', params.message),
          createdAt: assistantStoredMessage.createdAt,
          updatedAt: assistantStoredMessage.createdAt,
        });
      }

      await saveKidIndex(params.kidId, index);
      await setLastActiveChatId(params.kidId, params.chatId);
      await moveClaimedTaskToCompleted(params.kidId, { topic: evaluation.task.topic, instructions: evaluation.task.prompt }).catch(() => null);

      return {
        ...assistantStoredMessage,
        createdAt: toMessageTime(assistantStoredMessage.createdAt),
      };
    } catch (error) {
      if (!(error instanceof AppError) || error.status !== 404) {
        throw error;
      }
    }
  }

  const prompt = buildPrompt({
    kidName: kid.name,
    history: nextStoredMessages,
    multimodalContext,
    reminderText: activeReminder?.text,
    frenchWritingTaskText: activeFrenchWritingTask?.status === 'assigned' ? activeFrenchWritingTask.prompt : undefined,
  });

  const assistantText = await runOpenClawAgent(kid.agentId, prompt);
  const inlineImageGeneration = extractInlineImageGenerationPrompt(assistantText);

  if (inlineImageGeneration.prompt) {
    if (!capabilities.imageGeneration) {
      throw new AppError('这个聊天入口暂时不支持生成图片。', 403);
    }

    const generation = await generateImage({
      prompt: inlineImageGeneration.prompt,
    });

    const savedImages = await Promise.all(
      generation.images.map((imageUrl) =>
        saveGeneratedChatImage({
          kidId: params.kidId,
          chatId: params.chatId,
          imageUrl,
        }),
      ),
    );

    const language = detectReplyLanguage(params.message);
    const assistantStoredMessage: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content:
        inlineImageGeneration.cleanedText ||
        buildImageGenerationReplyText(language, inlineImageGeneration.prompt, generation.description),
      createdAt: nowIso(),
      attachments: savedImages.map((image) => ({
        kind: 'image_generated' as const,
        url: image.publicUrl,
        contentType: image.contentType,
        source: 'generated' as const,
        prompt: inlineImageGeneration.prompt,
        revisedPrompt: generation.revisedPrompt,
        generationStatus: 'completed' as const,
        provider: generation.provider,
        model: generation.model,
      })),
    };

    await saveChatMessages(params.kidId, params.chatId, [...nextStoredMessages, assistantStoredMessage]);
    return {
      ...assistantStoredMessage,
      createdAt: toMessageTime(assistantStoredMessage.createdAt),
    };
  }

  const assistantStoredMessage: ChatMessage = {
    id: `assistant-${Date.now()}`,
    role: 'assistant',
    content: assistantText,
    createdAt: nowIso(),
  };

  await saveChatMessages(params.kidId, params.chatId, [...nextStoredMessages, assistantStoredMessage]);

  if (activeReminder?.mode !== 'persistent') {
    await clearKidReminder(params.kidId);
  }

  const titleMode = multimodalPlan.intent === 'image_understanding' ? 'image_understanding' : 'chat';

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
      existing.title = buildTaskLabel(titleMode, params.message);
    }
  } else {
    index.chats.push({
      id: params.chatId,
      title: buildTaskLabel(titleMode, params.message),
      createdAt: assistantStoredMessage.createdAt,
      updatedAt: assistantStoredMessage.createdAt,
    });
  }

  await saveKidIndex(params.kidId, index);
  await setLastActiveChatId(params.kidId, params.chatId);

  return {
    ...assistantStoredMessage,
    createdAt: toMessageTime(assistantStoredMessage.createdAt),
  };
}
