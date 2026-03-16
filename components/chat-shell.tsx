'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChatMessage, ChatSummary, KidProfile } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme-toggle';

function getFriendlyChatError(status: number, fallback: string) {
  if (status === 400) {
    return fallback || '这条消息好像有点问题，请检查后再试一次。';
  }

  if (status === 502) {
    return fallback || '我现在暂时连不上智能体，请稍后再试。';
  }

  if (status >= 500) {
    return fallback || '服务器现在有点忙，请稍后再试。';
  }

  return fallback || '抱歉，刚才发送失败了，请再试一次。';
}

export function ChatShell(props: {
  kid: KidProfile;
  chats: ChatSummary[];
  initialChatId: string;
  initialMessages: ChatMessage[];
}) {
  const { kid, chats, initialChatId, initialMessages } = props;
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [creatingChat, setCreatingChat] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMessages(initialMessages);
    setDraft('');
    setSending(false);
  }, [initialChatId, initialMessages]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const frame = window.requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [messages, sending]);

  async function onCreateChat() {
    if (creatingChat) return;
    setCreatingChat(true);

    try {
      const response = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kidId: kid.id }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || '创建新对话失败，请稍后再试。');
      }

      const data = (await response.json()) as { chatId: string };
      router.push(`/kid/${kid.id}?chat=${data.chatId}`);
      router.refresh();
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: `create-chat-error-${Date.now()}`,
          role: 'assistant',
          content: error instanceof Error ? error.message : '创建新对话失败，请稍后再试。',
          createdAt: '刚刚',
        },
      ]);
    } finally {
      setCreatingChat(false);
    }
  }

  async function onSignOut() {
    setSigningOut(true);

    try {
      const response = await fetch('/api/clear-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kidId: kid.id }),
      });

      if (!response.ok) {
        throw new Error('退出失败');
      }

      window.location.href = '/';
    } catch {
      setSigningOut(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: '抱歉，退出失败了，请再试一次。',
          createdAt: '刚刚',
        },
      ]);
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || sending) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
      createdAt: '刚刚',
    };

    setMessages((prev) => [...prev, userMessage]);
    setDraft('');
    setSending(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kidId: kid.id,
          chatId: initialChatId,
          message,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as { reply?: ChatMessage; error?: string };

      if (!response.ok) {
        throw new Error(getFriendlyChatError(response.status, data.error || ''));
      }

      if (!data.reply) {
        throw new Error('服务器返回了空结果，请稍后再试。');
      }

      const reply = data.reply;
      setMessages((prev) => [...prev, reply]);
      router.refresh();
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: error instanceof Error ? error.message : '抱歉，刚才发送失败了，请再试一次。',
          createdAt: '刚刚',
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  const activeChat = chats.find((chat) => chat.id === initialChatId);

  return (
    <div className="chat-layout">
      <aside className="sidebar">
        <div className="sidebar-head sidebar-head-themed">
          <div className="avatar avatar-large" style={{ background: kid.accentColor }}>
            {kid.emoji || kid.name.slice(0, 1)}
          </div>
          <div>
            <h1>{kid.name}</h1>
            <p>{kid.title}</p>
          </div>
        </div>

        <button className="new-chat" style={{ background: kid.accentColor }} onClick={onCreateChat} disabled={creatingChat}>
          {creatingChat ? '创建中…' : '+ 新对话'}
        </button>

        <div className="chat-list">
          {chats.map((chat) => (
            <Link
              key={chat.id}
              href={`/kid/${kid.id}?chat=${chat.id}`}
              className={cn('chat-item', chat.id === initialChatId && 'active')}
              style={
                chat.id === initialChatId
                  ? {
                      color: kid.accentColor,
                      borderColor: `${kid.accentColor}66`,
                      background: `${kid.accentColor}10`,
                    }
                  : undefined
              }
            >
              <strong>{chat.title}</strong>
              <span>{chat.preview}</span>
              <small>{chat.updatedAt}</small>
            </Link>
          ))}
        </div>
      </aside>

      <section className="chat-main">
        <header className="chat-header" style={{ borderBottomColor: `${kid.accentColor}22` }}>
          <div className="chat-header-topbar">
            <div className="chat-title-card" style={{ background: `${kid.accentColor}12` }}>
              <div className="chat-title-badge" style={{ background: kid.accentColor }}>
                {kid.emoji || kid.name.slice(0, 1)}
              </div>
              <div>
                <h2>{activeChat?.title ?? '新对话'}</h2>
                <p>{kid.welcome}</p>
              </div>
            </div>
            <div className="chat-header-actions">
              <button className="chat-secondary-button" onClick={onSignOut} disabled={signingOut} type="button">
                {signingOut ? '退出中…' : '退出聊天'}
              </button>
              <ThemeToggle />
            </div>
          </div>
        </header>

        <div className="messages" ref={messagesContainerRef}>
          {messages.length === 0 ? (
            <div className="empty-state">这里还没有消息，开始第一句聊天吧。</div>
          ) : (
            messages.map((message) => (
              <article
                key={message.id}
                className={cn('message', message.role)}
                style={
                  message.role === 'user'
                    ? { background: `${kid.accentColor}22`, borderColor: `${kid.accentColor}40` }
                    : undefined
                }
              >
                <div>{message.content}</div>
                <time>{message.createdAt}</time>
              </article>
            ))
          )}

          {sending ? (
            <article className="message assistant message-thinking" aria-live="polite" aria-busy="true">
              <div className="thinking-bubble">
                <span className="thinking-label">正在输入中</span>
                <span className="thinking-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
              <time>现在</time>
            </article>
          ) : null}

        </div>

        <div className="composer">
          <form onSubmit={onSubmit}>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={sending ? '正在等待回复…' : '输入想说的话…'}
              disabled={sending}
            />
            <button type="submit" style={{ background: kid.accentColor }} disabled={sending}>
              {sending ? '发送中' : '发送'}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
