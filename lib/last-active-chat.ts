import { promises as fs } from 'fs';
import path from 'path';

const storePath = path.join(process.cwd(), 'data', 'last-active-chat.json');

type LastActiveChatStore = Record<string, string>;

async function readStore(): Promise<LastActiveChatStore> {
  try {
    const raw = await fs.readFile(storePath, 'utf8');
    return JSON.parse(raw) as LastActiveChatStore;
  } catch {
    return {};
  }
}

async function writeStore(store: LastActiveChatStore) {
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, JSON.stringify(store, null, 2), 'utf8');
}

export async function getLastActiveChatId(kidId: string): Promise<string | null> {
  const store = await readStore();
  return typeof store[kidId] === 'string' && store[kidId].trim() ? store[kidId].trim() : null;
}

export async function setLastActiveChatId(kidId: string, chatId: string): Promise<void> {
  const store = await readStore();
  store[kidId] = chatId;
  await writeStore(store);
}
