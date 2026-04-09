import { promises as fs } from 'fs';
import path from 'path';
import { getConfiguredKidById } from './kid-settings';

type KidReminder = {
  active?: boolean;
  text?: string;
  mode?: 'once' | 'persistent';
  createdAt?: string;
};

function getReminderPath(kidId: string) {
  return path.join(process.cwd(), 'data', 'reminders', `${kidId}.json`);
}

function pickRewardTheme(themes: string[]) {
  if (!themes.length) return '';
  const dayIndex = Math.floor(Date.now() / 86400000);
  return themes[dayIndex % themes.length] || themes[0] || '';
}

function buildRewardHint(kidName: string, rewardSettings: { enabled?: boolean; defaultType?: string; certificateTitle?: string; imageThemes?: string[]; encouragementStyle?: string } | undefined) {
  if (!rewardSettings || rewardSettings.enabled === false) return '';

  const themes = Array.isArray(rewardSettings.imageThemes) ? rewardSettings.imageThemes.filter(Boolean) : [];
  const firstTheme = pickRewardTheme(themes);
  const certificateTitle = rewardSettings.certificateTitle?.trim() || '';
  const lower = kidName.toLowerCase();

  if (rewardSettings.defaultType === 'certificate') {
    return certificateTitle
      ? `If it fits naturally, hint that finishing can earn a certificate called "${certificateTitle}".`
      : 'If it fits naturally, hint that finishing can earn a certificate reward.';
  }

  if (rewardSettings.defaultType === 'message') {
    return 'If it fits naturally, hint that finishing can earn a special encouraging celebration message.';
  }

  if (lower.includes('grace')) {
    return firstTheme
      ? `If it fits naturally, hint that finishing can earn a gentle reward image themed around ${firstTheme}.`
      : 'If it fits naturally, hint that finishing can earn a gentle celebratory reward image.';
  }

  if (lower.includes('george')) {
    return firstTheme
      ? `If it fits naturally, hint that finishing can earn a challenge-style reward image themed around ${firstTheme}.`
      : 'If it fits naturally, hint that finishing can earn a challenge-style celebratory reward image.';
  }

  return firstTheme
    ? `If it fits naturally, hint that finishing can earn a reward image themed around ${firstTheme}.`
    : 'If it fits naturally, hint that finishing can earn a small reward.';
}

export async function readKidReminder(kidId: string): Promise<KidReminder | null> {
  try {
    const raw = await fs.readFile(getReminderPath(kidId), 'utf8');
    const parsed = JSON.parse(raw) as KidReminder;
    if (parsed.active !== true || !parsed.text?.trim()) {
      return null;
    }

    const kid = await getConfiguredKidById(kidId);
    const rewardHint = buildRewardHint(kid?.name || kidId, kid?.rewardSettings);
    const text = [parsed.text.trim(), rewardHint].filter(Boolean).join(' ');

    return {
      active: true,
      text,
      mode: parsed.mode === 'persistent' ? 'persistent' : 'once',
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}

export async function clearKidReminder(kidId: string) {
  try {
    await fs.rm(getReminderPath(kidId), { force: true });
  } catch {
    // ignore
  }
}
