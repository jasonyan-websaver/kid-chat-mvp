import { promises as fs } from 'fs';
import path from 'path';
import { kids, getKidById } from './kids';
import type { KidProfile } from './types';

const settingsPath = path.join(process.cwd(), 'data', 'kid-settings.json');

type KidOverrides = {
  name?: string;
  emoji?: string;
  accentColor?: string;
  title?: string;
  welcome?: string;
};

type KidSettingsFile = Record<string, KidOverrides>;

async function readSettingsFile(): Promise<KidSettingsFile> {
  try {
    const raw = await fs.readFile(settingsPath, 'utf8');
    return JSON.parse(raw) as KidSettingsFile;
  } catch {
    return {};
  }
}

function normalizeAccentColor(value: string | undefined, fallback: string) {
  const color = String(value || '').trim();
  return /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(color) ? color : fallback;
}

export async function getConfiguredKids(): Promise<KidProfile[]> {
  const settings = await readSettingsFile();
  return kids.map((kid) => ({
    ...kid,
    name: settings[kid.id]?.name?.trim() || kid.name,
    emoji: settings[kid.id]?.emoji?.trim() || kid.emoji,
    accentColor: normalizeAccentColor(settings[kid.id]?.accentColor, kid.accentColor),
    title: settings[kid.id]?.title?.trim() || kid.title,
    welcome: settings[kid.id]?.welcome?.trim() || kid.welcome,
  }));
}

export async function getConfiguredKidById(kidId: string): Promise<KidProfile | null> {
  const base = getKidById(kidId);
  if (!base) return null;

  const settings = await readSettingsFile();
  return {
    ...base,
    name: settings[base.id]?.name?.trim() || base.name,
    emoji: settings[base.id]?.emoji?.trim() || base.emoji,
    accentColor: normalizeAccentColor(settings[base.id]?.accentColor, base.accentColor),
    title: settings[base.id]?.title?.trim() || base.title,
    welcome: settings[base.id]?.welcome?.trim() || base.welcome,
  };
}

export async function readKidTextSettings() {
  const settings = await readSettingsFile();
  return Object.fromEntries(
    kids.map((kid) => [
      kid.id,
      {
        name: settings[kid.id]?.name?.trim() || kid.name,
        emoji: settings[kid.id]?.emoji?.trim() || kid.emoji || '',
        accentColor: normalizeAccentColor(settings[kid.id]?.accentColor, kid.accentColor),
        title: settings[kid.id]?.title?.trim() || kid.title,
        welcome: settings[kid.id]?.welcome?.trim() || kid.welcome,
      },
    ]),
  ) as Record<string, { name: string; emoji: string; accentColor: string; title: string; welcome: string }>;
}

export async function writeKidTextSettings(input: Record<string, { name?: string; emoji?: string; accentColor?: string; title?: string; welcome?: string }>) {
  const next: KidSettingsFile = {};

  for (const kid of kids) {
    next[kid.id] = {
      name: input[kid.id]?.name?.trim() || kid.name,
      emoji: input[kid.id]?.emoji?.trim() || kid.emoji,
      accentColor: normalizeAccentColor(input[kid.id]?.accentColor, kid.accentColor),
      title: input[kid.id]?.title?.trim() || kid.title,
      welcome: input[kid.id]?.welcome?.trim() || kid.welcome,
    };
  }

  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(next, null, 2), 'utf8');
}
