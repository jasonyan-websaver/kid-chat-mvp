import { promises as fs } from 'fs';
import path from 'path';
import { generateImage } from './image-generation';
import { saveGeneratedChatImage } from './upload';
import { AppError } from './app-error';
import type { ChatAttachment, KidProfile } from './types';

export type FrenchWritingTask = {
  id: string;
  kidId: string;
  kidName: string;
  chatId: string;
  status: 'assigned' | 'completed';
  topic: string;
  prompt: string;
  rewardTheme: string;
  rewardPrompt: string;
  targetWordCount: number;
  assignedAt: string;
  completedAt?: string;
  evaluation?: {
    completed: boolean;
    reason: string;
    languageOk: boolean;
    topicOk: boolean;
    lengthOk: boolean;
  };
  rewardImageUrl?: string;
};

const taskDataRoot = path.join(process.cwd(), 'data', 'french-writing-tasks');

function nowIso() {
  return new Date().toISOString();
}

function getTaskDir(kidId: string) {
  return path.join(taskDataRoot, kidId);
}

function getTaskPath(kidId: string, chatId: string) {
  return path.join(getTaskDir(kidId), `${chatId}.json`);
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

function slugifyTopic(topic: string) {
  return topic
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fffàâçéèêëîïôûùüÿœæ -]/gi, '')
    .replace(/\s+/g, ' ');
}

const TOPIC_LIBRARY = [
  {
    key: 'rocket',
    aliases: ['rocket', 'rockets', 'fusée', 'fusee', '火箭', '太空火箭'],
    topicLabel: 'la fusée',
    rewardTheme: 'rocket',
    imagePrompt: 'A beautiful, child-friendly rocket illustration soaring through space, colorful stars, polished storybook style, celebratory reward image',
  },
  {
    key: 'ocean',
    aliases: ['ocean', 'sea', 'mer', '海洋', '大海'],
    topicLabel: 'la mer',
    rewardTheme: 'ocean',
    imagePrompt: 'A beautiful, child-friendly ocean illustration with gentle waves and sea animals, colorful storybook style, celebratory reward image',
  },
  {
    key: 'dinosaur',
    aliases: ['dinosaur', 'dinosaure', '恐龙'],
    topicLabel: 'le dinosaure',
    rewardTheme: 'dinosaur',
    imagePrompt: 'A beautiful, child-friendly dinosaur illustration, bright colors, warm storybook style, celebratory reward image',
  },
];

function resolveTopic(topic?: string) {
  const normalized = slugifyTopic(topic || 'rocket');
  const found = TOPIC_LIBRARY.find((item) => item.aliases.some((alias) => normalized.includes(alias.toLowerCase())));
  if (found) return found;

  const cleanLabel = topic?.trim() || '火箭';
  return {
    key: cleanLabel.toLowerCase(),
    aliases: [cleanLabel.toLowerCase()],
    topicLabel: cleanLabel,
    rewardTheme: cleanLabel,
    imagePrompt: `A beautiful, child-friendly reward illustration about ${cleanLabel}, polished storybook style, celebratory image`,
  };
}

export async function readFrenchWritingTask(kidId: string, chatId: string): Promise<FrenchWritingTask | null> {
  const task = await readJsonFile<FrenchWritingTask | null>(getTaskPath(kidId, chatId), null);
  return task;
}

export async function createFrenchWritingTask(params: {
  kid: KidProfile;
  chatId: string;
  topic?: string;
  targetWordCount?: number;
}): Promise<FrenchWritingTask> {
  const resolved = resolveTopic(params.topic);
  const targetWordCount = typeof params.targetWordCount === 'number' && Number.isFinite(params.targetWordCount)
    ? Math.max(5, Math.min(80, Math.round(params.targetWordCount)))
    : 20;

  const task: FrenchWritingTask = {
    id: `fw-${Date.now()}`,
    kidId: params.kid.id,
    kidName: params.kid.name,
    chatId: params.chatId,
    status: 'assigned',
    topic: resolved.topicLabel,
    prompt: `Écris un petit texte en français sur le thème « ${resolved.topicLabel} », avec environ ${targetWordCount} mots. Quand tu auras terminé, tu recevras une magnifique image-récompense sur le thème de ${resolved.topicLabel}.`,
    rewardTheme: resolved.rewardTheme,
    rewardPrompt: resolved.imagePrompt,
    targetWordCount,
    assignedAt: nowIso(),
  };

  await writeJsonFile(getTaskPath(params.kid.id, params.chatId), task);
  return task;
}

export function looksLikeFrenchWritingSubmission(text: string) {
  const normalized = text.trim();
  if (!normalized) return false;
  if (/[àâçéèêëîïôûùüÿœæ]/i.test(normalized)) return true;

  const frenchWords = [
    'le', 'la', 'les', 'un', 'une', 'des', 'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles',
    'est', 'suis', 'dans', 'sur', 'avec', 'pour', 'bonjour', 'merci', 'fusée', 'fusee', 'bleu', 'ciel', 'vite', 'petit', 'grande'
  ];

  const lowered = ` ${normalized.toLowerCase()} `;
  const hits = frenchWords.filter((word) => lowered.includes(` ${word} `));
  return hits.length >= 2;
}

function looksOnTopic(text: string, topic: string) {
  const normalizedText = slugifyTopic(text);
  const resolved = resolveTopic(topic);
  return resolved.aliases.some((alias) => normalizedText.includes(alias.toLowerCase()));
}

function looksLengthOk(text: string, targetWordCount: number) {
  const words = text
    .trim()
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  return words.length >= targetWordCount;
}

function buildCompletionReason(params: { languageOk: boolean; topicOk: boolean; lengthOk: boolean; topic: string; targetWordCount: number }) {
  if (params.languageOk && params.topicOk && params.lengthOk) {
    return '很好，内容看起来是法语，也围绕指定主题，长度也基本合适。';
  }

  const reasons: string[] = [];
  if (!params.languageOk) reasons.push('还需要更像一段法语句子');
  if (!params.topicOk) reasons.push(`内容需要更明显地围绕“${params.topic}”`);
  if (!params.lengthOk) reasons.push(`le texte doit contenir au moins ${params.targetWordCount} mots`);
  return `C'est déjà un bon début, mais il manque encore un petit peu : ${reasons.join(' ; ')}.`;
}

export async function completeFrenchWritingTask(task: FrenchWritingTask) {
  task.status = 'completed';
  task.completedAt = nowIso();
  task.evaluation = task.evaluation || {
    completed: true,
    reason: 'Superseded by a newer dispatched task.',
    languageOk: true,
    topicOk: true,
    lengthOk: true,
  };
  await writeJsonFile(getTaskPath(task.kidId, task.chatId), task);
  return task;
}

export async function evaluateFrenchWritingTask(params: {
  kid: KidProfile;
  chatId: string;
  submissionText: string;
}): Promise<{ task: FrenchWritingTask; rewardAttachments: ChatAttachment[] }> {
  const task = await readFrenchWritingTask(params.kid.id, params.chatId);
  if (!task || task.status !== 'assigned') {
    throw new AppError('当前没有待完成的法语写作任务。', 404);
  }

  const submission = params.submissionText.trim();
  if (!submission) {
    throw new AppError('请先提交孩子写的法语内容。', 400);
  }

  const languageOk = looksLikeFrenchWritingSubmission(submission);
  const topicOk = looksOnTopic(submission, task.topic);
  const lengthOk = looksLengthOk(submission, task.targetWordCount);
  const completed = languageOk && topicOk && lengthOk;
  const reason = buildCompletionReason({ languageOk, topicOk, lengthOk, topic: task.topic, targetWordCount: task.targetWordCount });

  task.evaluation = {
    completed,
    reason,
    languageOk,
    topicOk,
    lengthOk,
  };

  if (!completed) {
    await writeJsonFile(getTaskPath(params.kid.id, params.chatId), task);
    return { task, rewardAttachments: [] };
  }

  const generated = await generateImage({
    prompt: task.rewardPrompt,
  });

  const firstImage = generated.images[0];
  if (!firstImage) {
    throw new AppError('奖励图片生成成功，但没有拿到图片结果。', 502);
  }

  const savedImage = await saveGeneratedChatImage({
    kidId: params.kid.id,
    chatId: params.chatId,
    imageUrl: firstImage,
  });

  task.status = 'completed';
  task.completedAt = nowIso();
  task.rewardImageUrl = savedImage.publicUrl;

  await writeJsonFile(getTaskPath(params.kid.id, params.chatId), task);

  const rewardAttachments: ChatAttachment[] = [
    {
      kind: 'image_generated',
      url: savedImage.publicUrl,
      contentType: savedImage.contentType,
      source: 'generated',
      prompt: task.rewardPrompt,
      revisedPrompt: generated.revisedPrompt,
      generationStatus: 'completed',
      provider: generated.provider,
      model: generated.model,
    },
  ];

  return { task, rewardAttachments };
}
