import { promises as fs } from 'fs';
import path from 'path';

const logPath = path.join(process.cwd(), 'data', 'smoke-tests', 'image-generation.json');

export type SmokeTestEntry = {
  key: 'chain' | 'media-agent' | 'gemini-direct';
  label: string;
  ok: boolean;
  message: string;
  provider?: string;
  model?: string;
  imageCount?: number;
  elapsedMs?: number;
  ranAt: string;
};

export type SmokeTestLog = {
  imageGeneration: Record<string, SmokeTestEntry | undefined>;
};

async function readLog(): Promise<SmokeTestLog> {
  try {
    const raw = await fs.readFile(logPath, 'utf8');
    return JSON.parse(raw) as SmokeTestLog;
  } catch {
    return { imageGeneration: {} };
  }
}

async function writeLog(log: SmokeTestLog) {
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.writeFile(logPath, JSON.stringify(log, null, 2), 'utf8');
}

export async function recordSmokeTest(entry: SmokeTestEntry) {
  const log = await readLog();
  log.imageGeneration[entry.key] = entry;
  await writeLog(log);
}

export async function getSmokeTestLog() {
  return readLog();
}
