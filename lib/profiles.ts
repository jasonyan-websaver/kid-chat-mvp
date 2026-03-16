import { promises as fs } from 'fs';
import path from 'path';
import { normalizeKidProfile } from './profile-schema';

export type KidProfileMemory = {
  name?: string;
  ageGroup?: string;
  languages?: string[];
  likes?: string[];
  learningGoals?: string[];
  tone?: string;
  responseStyle?: string[];
  avoid?: string[];
  notes?: string[];
};

const profilesDir = path.join(process.cwd(), 'data', 'profiles');

export async function readKidProfileMemory(kidId: string): Promise<KidProfileMemory | null> {
  try {
    const raw = await fs.readFile(path.join(profilesDir, `${kidId}.json`), 'utf8');
    return normalizeKidProfile(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function formatKidProfileMemory(profile: KidProfileMemory | null): string {
  if (!profile) {
    return 'No long-term child profile is available.';
  }

  const sections: string[] = [];

  if (profile.name) sections.push(`Name: ${profile.name}`);
  if (profile.ageGroup) sections.push(`Age group: ${profile.ageGroup}`);
  if (profile.languages?.length) sections.push(`Languages: ${profile.languages.join(', ')}`);
  if (profile.likes?.length) sections.push(`Likes: ${profile.likes.join(', ')}`);
  if (profile.learningGoals?.length) sections.push(`Learning goals: ${profile.learningGoals.join(', ')}`);
  if (profile.tone) sections.push(`Preferred tone: ${profile.tone}`);
  if (profile.responseStyle?.length) sections.push(`Response style: ${profile.responseStyle.join(' | ')}`);
  if (profile.avoid?.length) sections.push(`Avoid: ${profile.avoid.join(', ')}`);
  if (profile.notes?.length) sections.push(`Notes: ${profile.notes.join(' | ')}`);

  return sections.join('\n');
}
