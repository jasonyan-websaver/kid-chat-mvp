import { promises as fs } from 'fs';
import path from 'path';
import { getAllKidIds } from './kids';

const envPath = path.join(process.cwd(), '.env.local');

function parseEnv(content: string) {
  const values: Record<string, string> = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const index = trimmed.indexOf('=');
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1);
    values[key] = value;
  }

  return values;
}

function serializeEnv(values: Record<string, string>) {
  const kidPinKeys = getAllKidIds().map((id) => `KID_CHAT_PIN_${id.toUpperCase()}`);
  const orderedKeys = [...kidPinKeys, 'KID_CHAT_ADMIN_PIN', 'OPENCLAW_USE_MOCK', 'KID_CHAT_PM2_NAME'];

  const lines = orderedKeys
    .filter((key) => key in values)
    .map((key) => `${key}=${values[key]}`);

  return `${lines.join('\n')}\n`;
}

export type AdminEnvValues = {
  kidPins: Record<string, string>;
  adminPin: string;
  useMock: string;
  pm2Name: string;
};

export async function readAdminEnvValues(): Promise<AdminEnvValues> {
  let raw = '';
  try {
    raw = await fs.readFile(envPath, 'utf8');
  } catch {
    raw = '';
  }

  const parsed = parseEnv(raw);
  const kidPins = Object.fromEntries(
    getAllKidIds().map((id) => [id, parsed[`KID_CHAT_PIN_${id.toUpperCase()}`] || '']),
  );

  return {
    kidPins,
    adminPin: parsed.KID_CHAT_ADMIN_PIN || '',
    useMock: parsed.OPENCLAW_USE_MOCK === 'true' ? 'true' : 'false',
    pm2Name: parsed.KID_CHAT_PM2_NAME || 'kid-chat-mvp',
  };
}

export async function writeAdminEnvValues(input: AdminEnvValues) {
  const values: Record<string, string> = {
    KID_CHAT_ADMIN_PIN: input.adminPin.trim(),
    OPENCLAW_USE_MOCK: input.useMock.trim() || 'false',
    KID_CHAT_PM2_NAME: input.pm2Name.trim() || 'kid-chat-mvp',
  };

  for (const id of getAllKidIds()) {
    values[`KID_CHAT_PIN_${id.toUpperCase()}`] = (input.kidPins[id] || '').trim();
  }

  await fs.writeFile(envPath, serializeEnv(values), 'utf8');
}
