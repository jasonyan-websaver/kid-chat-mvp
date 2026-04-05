import { promises as fs } from 'fs';
import path from 'path';

const throttleDir = path.join(process.cwd(), 'data', 'memory-throttle');
const MIN_MESSAGES_BETWEEN_EXTRACTIONS = 8;
const MIN_MS_BETWEEN_EXTRACTIONS = 1000 * 60 * 120;

type ThrottleState = {
  lastExtractionAt?: string;
  messagesSinceLastExtraction: number;
};

function getThrottlePath(kidId: string) {
  return path.join(throttleDir, `${kidId}.json`);
}

async function readState(kidId: string): Promise<ThrottleState> {
  try {
    const raw = await fs.readFile(getThrottlePath(kidId), 'utf8');
    return JSON.parse(raw) as ThrottleState;
  } catch {
    return { messagesSinceLastExtraction: 0 };
  }
}

async function writeState(kidId: string, state: ThrottleState) {
  await fs.mkdir(throttleDir, { recursive: true });
  await fs.writeFile(getThrottlePath(kidId), JSON.stringify(state, null, 2), 'utf8');
}

export async function shouldRunMemoryExtraction(kidId: string) {
  const state = await readState(kidId);
  const now = Date.now();
  const lastAt = state.lastExtractionAt ? new Date(state.lastExtractionAt).getTime() : 0;
  const enoughMessages = state.messagesSinceLastExtraction >= MIN_MESSAGES_BETWEEN_EXTRACTIONS;
  const enoughTime = !lastAt || now - lastAt >= MIN_MS_BETWEEN_EXTRACTIONS;

  return enoughMessages && enoughTime;
}

export async function markMessageForMemoryThrottle(kidId: string) {
  const state = await readState(kidId);
  state.messagesSinceLastExtraction = (state.messagesSinceLastExtraction || 0) + 1;
  await writeState(kidId, state);
}

export async function markMemoryExtractionRan(kidId: string) {
  await writeState(kidId, {
    lastExtractionAt: new Date().toISOString(),
    messagesSinceLastExtraction: 0,
  });
}
