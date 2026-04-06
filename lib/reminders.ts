import { promises as fs } from 'fs';
import path from 'path';

type KidReminder = {
  active?: boolean;
  text?: string;
  mode?: 'once' | 'persistent';
  createdAt?: string;
};

function getReminderPath(kidId: string) {
  return path.join(process.cwd(), 'data', 'reminders', `${kidId}.json`);
}

export async function readKidReminder(kidId: string): Promise<KidReminder | null> {
  try {
    const raw = await fs.readFile(getReminderPath(kidId), 'utf8');
    const parsed = JSON.parse(raw) as KidReminder;
    if (parsed.active !== true || !parsed.text?.trim()) {
      return null;
    }
    return {
      active: true,
      text: parsed.text.trim(),
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
