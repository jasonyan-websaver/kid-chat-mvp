import { notFound } from 'next/navigation';
import { ChatShell } from '@/components/chat-shell';
import { getConfiguredKidById } from '@/lib/kid-settings';
import { importInboxTaskToKidChat } from '@/lib/kid-task-inbox';
import { getLastActiveChatId } from '@/lib/last-active-chat';
import { getMessagesForChat, listChatsForKid } from '@/lib/openclaw';

export default async function KidChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ kidId: string }>;
  searchParams: Promise<{ chat?: string }>;
}) {
  const { kidId } = await params;
  const { chat } = await searchParams;
  const kid = await getConfiguredKidById(kidId);

  if (!kid) {
    notFound();
  }

  await importInboxTaskToKidChat(kid.id).catch(() => null);

  const chats = await listChatsForKid(kid.id);
  const lastActiveChatId = await getLastActiveChatId(kid.id);
  const fallbackChatId = chats.some((item) => item.id === lastActiveChatId) ? lastActiveChatId : chats[0]?.id;
  const activeChatId = chat ?? fallbackChatId ?? 'welcome';
  const messages = await getMessagesForChat(kid.id, activeChatId);

  return (
    <ChatShell
      key={activeChatId}
      kid={kid}
      chats={chats}
      initialChatId={activeChatId}
      initialMessages={messages}
    />
  );
}
