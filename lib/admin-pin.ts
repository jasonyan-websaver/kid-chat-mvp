export const ADMIN_PIN_COOKIE = 'kid-chat-admin-pin';

export function getExpectedAdminPin() {
  return process.env.KID_CHAT_ADMIN_PIN?.trim() || '';
}
