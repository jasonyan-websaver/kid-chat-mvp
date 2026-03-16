import type { KidProfileMemory } from './profiles';

export const ALLOWED_PROFILE_KEYS = [
  'name',
  'ageGroup',
  'languages',
  'likes',
  'learningGoals',
  'tone',
  'responseStyle',
  'avoid',
  'notes',
] as const;

const ALLOWED_KEYS: ReadonlySet<string> = new Set(ALLOWED_PROFILE_KEYS);

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringArray(value: unknown, fieldName: string) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} 必须是字符串数组。`);
  }

  return value
    .map((item) => {
      if (typeof item !== 'string') {
        throw new Error(`${fieldName} 只能包含字符串。`);
      }
      return item.trim();
    })
    .filter(Boolean);
}

export function normalizeKidProfile(input: unknown, options?: { allowUnknownFields?: boolean }): KidProfileMemory {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('profile.json 顶层必须是 JSON 对象。');
  }

  const raw = input as Record<string, unknown>;
  const unknownKeys = Object.keys(raw).filter((key) => !ALLOWED_KEYS.has(key));
  if (unknownKeys.length > 0 && !options?.allowUnknownFields) {
    throw new Error(`profile.json 包含未支持字段：${unknownKeys.join(', ')}`);
  }

  return {
    name: normalizeString(raw.name),
    ageGroup: normalizeString(raw.ageGroup),
    languages: normalizeStringArray(raw.languages, 'languages'),
    likes: normalizeStringArray(raw.likes, 'likes'),
    learningGoals: normalizeStringArray(raw.learningGoals, 'learningGoals'),
    tone: normalizeString(raw.tone),
    responseStyle: normalizeStringArray(raw.responseStyle, 'responseStyle'),
    avoid: normalizeStringArray(raw.avoid, 'avoid'),
    notes: normalizeStringArray(raw.notes, 'notes'),
  };
}

export function getUnknownProfileKeys(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return [] as string[];
  }

  const raw = input as Record<string, unknown>;
  return Object.keys(raw).filter((key) => !ALLOWED_KEYS.has(key));
}

export function getUnknownProfileKeysFromJson(content: string) {
  try {
    return getUnknownProfileKeys(JSON.parse(content));
  } catch {
    return [] as string[];
  }
}

export function normalizeKidProfileJson(content: string, options?: { allowUnknownFields?: boolean; preserveUnknownFields?: boolean }) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('profile.json 不是有效的 JSON。');
  }

  const normalized = normalizeKidProfile(parsed, { allowUnknownFields: options?.allowUnknownFields });

  if (options?.allowUnknownFields && options?.preserveUnknownFields && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const raw = parsed as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...raw, ...normalized };
    return JSON.stringify(merged, null, 2);
  }

  return JSON.stringify(normalized, null, 2);
}
