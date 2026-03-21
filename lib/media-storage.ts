import { promises as fs } from 'fs';
import path from 'path';
import { getAllKidIds } from './kids';
import { normalizeKnownKidId } from './storage-ids';

const publicRoot = path.join(process.cwd(), 'public', 'chat-media');

export type KidMediaStorageStat = {
  kidId: string;
  fileCount: number;
  totalBytes: number;
  latestModifiedAt: string | null;
};

export type MediaStorageSummary = {
  rootPath: string;
  totalFileCount: number;
  totalBytes: number;
  kids: KidMediaStorageStat[];
};

async function walkFiles(dir: string): Promise<Array<{ path: string; size: number; mtimeMs: number }>> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return walkFiles(fullPath);
      if (!entry.isFile()) return [];
      const stat = await fs.stat(fullPath);
      return [{ path: fullPath, size: stat.size, mtimeMs: stat.mtimeMs }];
    }));
    return nested.flat();
  } catch {
    return [];
  }
}

export async function getMediaStorageSummary(): Promise<MediaStorageSummary> {
  const kids = await Promise.all(getAllKidIds().map(async (kidId) => {
    const dir = path.join(publicRoot, kidId);
    const files = await walkFiles(dir);
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    const latestModifiedAt = files.length ? new Date(Math.max(...files.map((file) => file.mtimeMs))).toISOString() : null;
    return {
      kidId,
      fileCount: files.length,
      totalBytes,
      latestModifiedAt,
    };
  }));

  return {
    rootPath: publicRoot,
    totalFileCount: kids.reduce((sum, kid) => sum + kid.fileCount, 0),
    totalBytes: kids.reduce((sum, kid) => sum + kid.totalBytes, 0),
    kids,
  };
}

export async function cleanupKidMediaStorage(kidId: string): Promise<KidMediaStorageStat> {
  const safeKidId = normalizeKnownKidId(kidId);
  const dir = path.join(publicRoot, safeKidId);
  const before = await walkFiles(dir);

  if (before.length > 0) {
    await fs.rm(dir, { recursive: true, force: true });
  }

  return {
    kidId: safeKidId,
    fileCount: 0,
    totalBytes: 0,
    latestModifiedAt: null,
  };
}
