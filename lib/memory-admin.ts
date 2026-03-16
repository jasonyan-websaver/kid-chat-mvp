import { promises as fs } from 'fs';
import { AppError } from './app-error';
import { getKidMemoryPath } from './kid-paths';

function getMemoryPath(kidId: string) {
  return getKidMemoryPath(kidId);
}

export async function readKidAgentMemory(kidId: string) {
  const filePath = getMemoryPath(kidId);
  if (!filePath) {
    throw new AppError('未知的孩子记忆路径。', 400);
  }

  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

export async function writeKidAgentMemory(kidId: string, content: string) {
  const filePath = getMemoryPath(kidId);
  if (!filePath) {
    throw new AppError('未知的孩子记忆路径。', 400);
  }

  try {
    await fs.writeFile(filePath, content, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new AppError(`写入 MEMORY.md 失败：${message}`, 500);
  }
}
