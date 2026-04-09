import { promises as fs } from 'fs';
import path from 'path';
import { getAllKidIds } from './kids';
import { getKidTaskDirs } from './kid-task-inbox';

async function readJson(filePath: string) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function listTasks(dir: string) {
  try {
    const names = (await fs.readdir(dir)).filter((name) => name.endsWith('.json')).sort();
    const tasks = [] as Record<string, unknown>[];
    for (const name of names) {
      const task = await readJson(path.join(dir, name));
      if (task) tasks.push(task);
    }
    return tasks;
  } catch {
    return [] as Record<string, unknown>[];
  }
}

export async function readAdminTaskStatuses() {
  return Promise.all(getAllKidIds().map(async (kidId) => {
    const dirs = getKidTaskDirs(kidId);
    if (!dirs) {
      return { kidId, inbox: [], claimed: [], completed: [], archived: [], activeTask: null, latestCompletedTask: null };
    }

    const [inbox, claimed, completed, archived] = await Promise.all([
      listTasks(dirs.inbox),
      listTasks(dirs.claimed),
      listTasks(dirs.completed),
      listTasks(dirs.archived),
    ]);

    return {
      kidId,
      inbox,
      claimed,
      completed,
      archived,
      activeTask: claimed[0] || inbox[0] || null,
      latestCompletedTask: completed.length ? completed[completed.length - 1] : null,
    };
  }));
}
