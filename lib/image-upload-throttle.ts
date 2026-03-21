import { promises as fs } from 'fs';
import path from 'path';
import { AppError } from './app-error';
import { normalizeKnownKidId } from './storage-ids';

const throttleDir = path.join(process.cwd(), 'data', 'image-upload-throttle');
export const IMAGE_UPLOAD_MIN_INTERVAL_MS = 12 * 1000;

type UploadThrottleState = {
  lastUploadAt?: string;
};

function getThrottlePath(kidId: string) {
  return path.join(throttleDir, `${normalizeKnownKidId(kidId)}.json`);
}

async function readState(kidId: string): Promise<UploadThrottleState> {
  try {
    const raw = await fs.readFile(getThrottlePath(kidId), 'utf8');
    return JSON.parse(raw) as UploadThrottleState;
  } catch {
    return {};
  }
}

async function writeState(kidId: string, state: UploadThrottleState) {
  await fs.mkdir(throttleDir, { recursive: true });
  await fs.writeFile(getThrottlePath(kidId), JSON.stringify(state, null, 2), 'utf8');
}

export async function enforceImageUploadThrottle(kidId: string) {
  const state = await readState(kidId);
  const now = Date.now();
  const lastAt = state.lastUploadAt ? new Date(state.lastUploadAt).getTime() : 0;

  if (lastAt && now - lastAt < IMAGE_UPLOAD_MIN_INTERVAL_MS) {
    const waitSeconds = Math.max(1, Math.ceil((IMAGE_UPLOAD_MIN_INTERVAL_MS - (now - lastAt)) / 1000));
    throw new AppError(`上传图片太频繁了，请等 ${waitSeconds} 秒再试。`, 429);
  }

  await writeState(kidId, { lastUploadAt: new Date(now).toISOString() });
}
