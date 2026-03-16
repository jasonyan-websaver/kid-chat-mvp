import { notFound } from 'next/navigation';
import { ChatShell } from '@/components/chat-shell';
import { getConfiguredKidById } from '@/lib/kid-settings';
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

  const chats = await listChatsForKid(kid.id);
  const activeChatId = chat ?? chats[0]?.id ?? 'default';
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
