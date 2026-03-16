import { getKidById } from './kids';

export function normalizeKidId(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase();
}

export function getPinCookieName(kidId: string) {
  return `kid-chat-pin-${normalizeKidId(kidId)}`;
}

export function getExpectedPinForKid(kidId: string) {
  const kid = getKidById(kidId);
  if (!kid) {
    return '';
  }

  const envKey = `KID_CHAT_PIN_${kid.id.toUpperCase()}`;
  return process.env[envKey]?.trim() || '';
}
