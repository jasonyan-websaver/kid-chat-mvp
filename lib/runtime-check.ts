import { promises as fs } from 'fs';
import { getConfiguredKids } from './kid-settings';
import { getKidMemoryPath, getKidWorkspaceDir } from './kid-paths';
import { getImageGenerationRuntimeCheck, type ImageGenerationRuntimeCheck } from './runtime-check-image';

export type KidRuntimeCheck = {
  kidId: string;
  kidName: string;
  agentId: string;
  workspaceDir: string | null;
  workspaceExists: boolean;
  memoryPath: string | null;
  memoryExists: boolean;
  issues: string[];
};

export type RuntimeCheckResult = {
  mode: 'mock' | 'real';
  openclawUseMock: string;
  pm2Name: string;
  kids: KidRuntimeCheck[];
  imageGeneration: ImageGenerationRuntimeCheck;
  issues: string[];
};

async function pathExists(target: string | null) {
  if (!target) return false;
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function getRuntimeCheckResult(): Promise<RuntimeCheckResult> {
  const configuredKids = await getConfiguredKids();
  const openclawUseMock = process.env.OPENCLAW_USE_MOCK === 'true' ? 'true' : 'false';
  const mode = openclawUseMock === 'true' ? 'mock' : 'real';
  const pm2Name = process.env.KID_CHAT_PM2_NAME?.trim() || 'kid-chat-mvp';
  const issues: string[] = [];
  const imageGeneration = await getImageGenerationRuntimeCheck();

  const kids = await Promise.all(
    configuredKids.map(async (kid) => {
      const workspaceDir = getKidWorkspaceDir(kid.id);
      const memoryPath = getKidMemoryPath(kid.id);
      const workspaceExists = await pathExists(workspaceDir);
      const memoryExists = await pathExists(memoryPath);
      const kidIssues: string[] = [];

      if (mode === 'real') {
        if (!workspaceDir || !workspaceExists) {
          kidIssues.push('workspace 目录不存在或不可访问');
        }
        if (!memoryPath) {
          kidIssues.push('MEMORY.md 路径无法解析');
        } else if (!memoryExists) {
          kidIssues.push('MEMORY.md 当前不存在，首次写入前可能需要创建');
        }
      }

      return {
        kidId: kid.id,
        kidName: kid.name,
        agentId: kid.agentId,
        workspaceDir,
        workspaceExists,
        memoryPath,
        memoryExists,
        issues: kidIssues,
      };
    }),
  );

  if (!process.env.KID_CHAT_ADMIN_PIN?.trim()) {
    issues.push('KID_CHAT_ADMIN_PIN 尚未配置');
  }

  for (const kid of configuredKids) {
    if (!process.env[`KID_CHAT_PIN_${kid.id.toUpperCase()}`]?.trim()) {
      issues.push(`${kid.name} 的 PIN 尚未配置`);
    }
  }

  if (mode === 'real') {
    issues.push(...kids.flatMap((kid) => kid.issues.map((issue) => `${kid.kidName}: ${issue}`)));
  }

  issues.push(...imageGeneration.issues.map((issue) => `图片生成: ${issue}`));

  return {
    mode,
    openclawUseMock,
    pm2Name,
    kids,
    imageGeneration,
    issues,
  };
}
