import { AdminPanel } from '@/components/admin-panel';
import { readAdminEnvValues } from '@/lib/env-admin';
import { getConfiguredKids, readKidTextSettings } from '@/lib/kid-settings';
import { readKidAgentMemory } from '@/lib/memory-admin';
import { getMediaStorageSummary } from '@/lib/media-storage';
import { getRuntimeCheckResult } from '@/lib/runtime-check';
import { getSmokeTestLog } from '@/lib/smoke-test-log';
import { getMessagesForChat, listChatsForKid } from '@/lib/openclaw';

export const dynamic = 'force-dynamic';

export default async function MemoryAdminPage() {
  const [configuredKids, envValues, textSettings, runtimeCheck, mediaStorage, smokeTests] = await Promise.all([
    getConfiguredKids(),
    readAdminEnvValues(),
    readKidTextSettings(),
    getRuntimeCheckResult(),
    getMediaStorageSummary(),
    getSmokeTestLog(),
  ]);

  const kidData = await Promise.all(
    configuredKids.map(async (kid) => {
      const chats = await listChatsForKid(kid.id);
      const messagesByChat = Object.fromEntries(
        await Promise.all(
          chats.map(async (chat) => [chat.id, await getMessagesForChat(kid.id, chat.id)] as const),
        ),
      );

      return {
        id: kid.id,
        name: kid.name,
        emoji: kid.emoji,
        memory: await readKidAgentMemory(kid.id),
        chats,
        messagesByChat,
      };
    }),
  );

  return <AdminPanel kids={kidData} envValues={envValues} textSettings={textSettings} runtimeCheck={runtimeCheck} mediaStorage={mediaStorage} smokeTests={smokeTests} />;
}
