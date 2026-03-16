import { promises as fs } from 'fs';
import { AppError } from './app-error';
import { getKidProfilePath } from './kid-paths';
import { normalizeKidProfileJson } from './profile-schema';

function getProfilePath(kidId: string) {
  return getKidProfilePath(kidId);
}

export async function readKidProfile(kidId: string) {
  const filePath = getProfilePath(kidId);
  if (!filePath) {
    throw new AppError('未知的孩子资料路径。', 400);
  }

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return normalizeKidProfileJson(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return '';
    }
    if (error instanceof Error) {
      throw new AppError(error.message, 400);
    }
    throw new AppError('读取 profile.json 失败。', 500);
  }
}

export async function writeKidProfile(kidId: string, content: string, options?: { allowUnknownFields?: boolean }) {
  const filePath = getProfilePath(kidId);
  if (!filePath) {
    throw new AppError('未知的孩子资料路径。', 400);
  }

  let normalized = '';
  try {
    normalized = normalizeKidProfileJson(content, {
      allowUnknownFields: options?.allowUnknownFields,
      preserveUnknownFields: options?.allowUnknownFields,
    });
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : 'profile.json 校验失败。', 400);
  }

  try {
    await fs.writeFile(filePath, normalized, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new AppError(`写入 profile.json 失败：${message}`, 500);
  }
}
