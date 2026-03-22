import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { AppError } from './app-error';
import { IMAGE_UPLOAD_ACCEPTED_TYPES, IMAGE_UPLOAD_MAX_BYTES, getAcceptedImageTypeLabel, formatBytesToMb } from './image-upload-policy';
import { normalizeKnownChatId, normalizeKnownKidId } from './storage-ids';

const allowedTypes = new Set<string>(IMAGE_UPLOAD_ACCEPTED_TYPES);
const publicRoot = path.join(process.cwd(), 'public', 'chat-media');

function getExtension(contentType: string) {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'image/gif') return 'gif';
  return 'bin';
}

function inferContentTypeFromUrl(url: string) {
  if (/\.png($|\?)/i.test(url)) return 'image/png';
  if (/\.jpe?g($|\?)/i.test(url)) return 'image/jpeg';
  if (/\.webp($|\?)/i.test(url)) return 'image/webp';
  if (/\.gif($|\?)/i.test(url)) return 'image/gif';
  return 'image/png';
}

export async function saveUploadedChatImage(params: {
  kidId: string;
  chatId: string;
  file: File;
}) {
  if (!allowedTypes.has(params.file.type)) {
    throw new AppError(`只支持 ${getAcceptedImageTypeLabel()} 图片。`, 400);
  }

  if (params.file.size > IMAGE_UPLOAD_MAX_BYTES) {
    throw new AppError(`图片不能超过 ${formatBytesToMb(IMAGE_UPLOAD_MAX_BYTES)}。`, 400);
  }

  const ext = getExtension(params.file.type);
  const filename = `${Date.now()}-${randomUUID()}.${ext}`;
  const safeKidId = normalizeKnownKidId(params.kidId);
  const safeChatId = normalizeKnownChatId(params.chatId);
  const dir = path.join(publicRoot, safeKidId, safeChatId);
  const filePath = path.join(dir, filename);
  const publicUrl = `/chat-media/${safeKidId}/${safeChatId}/${filename}`;

  await fs.mkdir(dir, { recursive: true });
  const arrayBuffer = await params.file.arrayBuffer();
  await fs.writeFile(filePath, Buffer.from(arrayBuffer));

  return {
    publicUrl,
    filePath,
    contentType: params.file.type,
    filename,
  };
}

export async function saveGeneratedChatImage(params: {
  kidId: string;
  chatId: string;
  imageUrl: string;
}) {
  const safeKidId = normalizeKnownKidId(params.kidId);
  const safeChatId = normalizeKnownChatId(params.chatId);
  const dir = path.join(publicRoot, safeKidId, safeChatId);
  await fs.mkdir(dir, { recursive: true });

  let buffer: Buffer;
  let contentType = inferContentTypeFromUrl(params.imageUrl);

  if (params.imageUrl.startsWith('data:')) {
    const match = params.imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      throw new AppError('生成图片返回了无法解析的 data URL。', 502);
    }
    contentType = match[1] || contentType;
    buffer = Buffer.from(match[2], 'base64');
  } else if (path.isAbsolute(params.imageUrl)) {
    buffer = await fs.readFile(params.imageUrl);
    contentType = inferContentTypeFromUrl(params.imageUrl) || contentType;
  } else if (params.imageUrl.startsWith('/')) {
    const sourcePath = path.join(process.cwd(), 'public', params.imageUrl.replace(/^\//, ''));
    buffer = await fs.readFile(sourcePath);
    contentType = inferContentTypeFromUrl(sourcePath) || contentType;
  } else {
    const response = await fetch(params.imageUrl);
    if (!response.ok) {
      throw new AppError(`下载生成图片失败：HTTP ${response.status}`, 502);
    }
    const arrayBuffer = await response.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
    contentType = response.headers.get('content-type') || contentType;
  }

  const ext = getExtension(contentType);
  const filename = `${Date.now()}-${randomUUID()}-generated.${ext}`;
  const filePath = path.join(dir, filename);
  const publicUrl = `/chat-media/${safeKidId}/${safeChatId}/${filename}`;

  await fs.writeFile(filePath, buffer);

  return {
    publicUrl,
    filePath,
    contentType,
    filename,
  };
}
