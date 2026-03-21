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
  ttsEnabled?: boolean;
  ttsPreferredVoiceName?: string;
  ttsRate?: number;
  imageGenerationEnabled?: boolean;
  imageUnderstandingEnabled?: boolean;
  imageEditEnabled?: boolean;
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

function normalizeTtsRate(value: number | undefined, fallback = 0.9) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0.6 && value <= 1.2 ? value : fallback;
}

function normalizeBoolean(value: boolean | undefined, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
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
    tts: {
      enabled: settings[kid.id]?.ttsEnabled !== false,
      preferredVoiceName: settings[kid.id]?.ttsPreferredVoiceName?.trim() || '',
      rate: normalizeTtsRate(settings[kid.id]?.ttsRate, 0.9),
    },
    capabilities: {
      imageGeneration: normalizeBoolean(settings[kid.id]?.imageGenerationEnabled, kid.capabilities?.imageGeneration ?? true),
      imageUnderstanding: normalizeBoolean(settings[kid.id]?.imageUnderstandingEnabled, kid.capabilities?.imageUnderstanding ?? true),
      imageEdit: normalizeBoolean(settings[kid.id]?.imageEditEnabled, kid.capabilities?.imageEdit ?? false),
    },
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
    tts: {
      enabled: settings[base.id]?.ttsEnabled !== false,
      preferredVoiceName: settings[base.id]?.ttsPreferredVoiceName?.trim() || '',
      rate: normalizeTtsRate(settings[base.id]?.ttsRate, 0.9),
    },
    capabilities: {
      imageGeneration: normalizeBoolean(settings[base.id]?.imageGenerationEnabled, base.capabilities?.imageGeneration ?? true),
      imageUnderstanding: normalizeBoolean(settings[base.id]?.imageUnderstandingEnabled, base.capabilities?.imageUnderstanding ?? true),
      imageEdit: normalizeBoolean(settings[base.id]?.imageEditEnabled, base.capabilities?.imageEdit ?? false),
    },
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
        ttsEnabled: settings[kid.id]?.ttsEnabled !== false,
        ttsPreferredVoiceName: settings[kid.id]?.ttsPreferredVoiceName?.trim() || '',
        ttsRate: normalizeTtsRate(settings[kid.id]?.ttsRate, 0.9),
        imageGenerationEnabled: normalizeBoolean(settings[kid.id]?.imageGenerationEnabled, kid.capabilities?.imageGeneration ?? true),
        imageUnderstandingEnabled: normalizeBoolean(settings[kid.id]?.imageUnderstandingEnabled, kid.capabilities?.imageUnderstanding ?? true),
        imageEditEnabled: normalizeBoolean(settings[kid.id]?.imageEditEnabled, kid.capabilities?.imageEdit ?? false),
      },
    ]),
  ) as Record<string, { name: string; emoji: string; accentColor: string; title: string; welcome: string; ttsEnabled: boolean; ttsPreferredVoiceName: string; ttsRate: number; imageGenerationEnabled: boolean; imageUnderstandingEnabled: boolean; imageEditEnabled: boolean }>;
}

export async function writeKidTextSettings(input: Record<string, { name?: string; emoji?: string; accentColor?: string; title?: string; welcome?: string; ttsEnabled?: boolean; ttsPreferredVoiceName?: string; ttsRate?: number; imageGenerationEnabled?: boolean; imageUnderstandingEnabled?: boolean; imageEditEnabled?: boolean }>) {
  const next: KidSettingsFile = {};

  for (const kid of kids) {
    next[kid.id] = {
      name: input[kid.id]?.name?.trim() || kid.name,
      emoji: input[kid.id]?.emoji?.trim() || kid.emoji,
      accentColor: normalizeAccentColor(input[kid.id]?.accentColor, kid.accentColor),
      title: input[kid.id]?.title?.trim() || kid.title,
      welcome: input[kid.id]?.welcome?.trim() || kid.welcome,
      ttsEnabled: input[kid.id]?.ttsEnabled !== false,
      ttsPreferredVoiceName: input[kid.id]?.ttsPreferredVoiceName?.trim() || '',
      ttsRate: normalizeTtsRate(input[kid.id]?.ttsRate, 0.9),
      imageGenerationEnabled: normalizeBoolean(input[kid.id]?.imageGenerationEnabled, kid.capabilities?.imageGeneration ?? true),
      imageUnderstandingEnabled: normalizeBoolean(input[kid.id]?.imageUnderstandingEnabled, kid.capabilities?.imageUnderstanding ?? true),
      imageEditEnabled: normalizeBoolean(input[kid.id]?.imageEditEnabled, kid.capabilities?.imageEdit ?? false),
    };
  }

  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(next, null, 2), 'utf8');
}
