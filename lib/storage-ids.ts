import { AppError } from './app-error';
import { getKidById } from './kids';
import { normalizeKidId } from './pin';

const CHAT_ID_PATTERN = /^(welcome|chat-\d{6,}|[a-z0-9][a-z0-9-]{1,63})$/;

export function normalizeKnownKidId(kidId: string) {
  const normalized = normalizeKidId(kidId);
  if (!normalized || !getKidById(normalized)) {
    throw new AppError('未知的孩子入口。', 400);
  }
  return normalized;
}

export function normalizeKnownChatId(chatId: string) {
  const normalized = String(chatId || '').trim().toLowerCase();
  if (!normalized || !CHAT_ID_PATTERN.test(normalized)) {
    throw new AppError('无效的 chatId。', 400);
  }
  return normalized;
}
