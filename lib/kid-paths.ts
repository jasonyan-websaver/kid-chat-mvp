import path from 'path';
import { getKidById } from './kids';

export function getKidWorkspaceDir(kidId: string) {
  const kid = getKidById(kidId);
  if (!kid) return null;

  const envKey = `KID_CHAT_WORKSPACE_${kid.id.toUpperCase()}`;
  const configured = process.env[envKey]?.trim();
  if (configured) return configured;

  const home = process.env.HOME;
  if (!home) return null;
  return path.join(home, '.openclaw', `workspace-${kid.id}`);
}

export function getKidMemoryPath(kidId: string) {
  const workspaceDir = getKidWorkspaceDir(kidId);
  if (!workspaceDir) return null;
  return path.join(workspaceDir, 'MEMORY.md');
}
