import { getAllKidIds } from './kids';

export type AdminEnvInput = {
  kidPins: Record<string, string>;
  adminPin: string;
  useMock: string;
  pm2Name: string;
};

function isDigitsOnly(value: string) {
  return /^\d+$/.test(value);
}

export function validateAdminEnvInput(input: AdminEnvInput) {
  const normalizedKidPins = Object.fromEntries(
    getAllKidIds().map((id) => [id, String(input.kidPins?.[id] || '').trim()]),
  );
  const adminPin = String(input.adminPin || '').trim();
  const useMock = String(input.useMock || '').trim();
  const pm2Name = String(input.pm2Name || '').trim();

  for (const kidId of getAllKidIds()) {
    const pin = normalizedKidPins[kidId];
    if (!pin) {
      throw new Error(`${kidId} 的 PIN 不能为空`);
    }
    if (!isDigitsOnly(pin)) {
      throw new Error(`${kidId} 的 PIN 只能包含数字`);
    }
    if (pin.length < 4) {
      throw new Error(`${kidId} 的 PIN 至少需要 4 位数字`);
    }
  }

  if (!adminPin) {
    throw new Error('家长 PIN 不能为空');
  }
  if (!isDigitsOnly(adminPin)) {
    throw new Error('家长 PIN 只能包含数字');
  }
  if (adminPin.length < 4) {
    throw new Error('家长 PIN 至少需要 4 位数字');
  }

  if (Object.values(normalizedKidPins).includes(adminPin)) {
    throw new Error('家长 PIN 不能和任一孩子的 PIN 相同');
  }

  if (useMock !== 'true' && useMock !== 'false') {
    throw new Error('OPENCLAW_USE_MOCK 必须是 true 或 false');
  }

  if (!pm2Name) {
    throw new Error('PM2 服务名不能为空');
  }

  return {
    kidPins: normalizedKidPins,
    adminPin,
    useMock,
    pm2Name,
  };
}
