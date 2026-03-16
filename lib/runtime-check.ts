import { promises as fs } from 'fs';
import { getConfiguredKids } from './kid-settings';
import { getKidMemoryPath, getKidProfilePath, getKidWorkspaceDir } from './kid-paths';

export type KidRuntimeCheck = {
  kidId: string;
  kidName: string;
  agentId: string;
  profilePath: string | null;
  profileExists: boolean;
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

  const kids = await Promise.all(
    configuredKids.map(async (kid) => {
      const profilePath = getKidProfilePath(kid.id);
      const workspaceDir = getKidWorkspaceDir(kid.id);
      const memoryPath = getKidMemoryPath(kid.id);
      const profileExists = await pathExists(profilePath);
      const workspaceExists = await pathExists(workspaceDir);
      const memoryExists = await pathExists(memoryPath);
      const kidIssues: string[] = [];

      if (!profilePath || !profileExists) {
        kidIssues.push('profile.json 不存在或不可访问');
      }

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
        profilePath,
        profileExists,
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

  return {
    mode,
    openclawUseMock,
    pm2Name,
    kids,
    issues,
  };
}
