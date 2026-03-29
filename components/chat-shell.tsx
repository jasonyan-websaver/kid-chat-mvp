'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { IMAGE_UPLOAD_ACCEPTED_TYPES, IMAGE_UPLOAD_MAX_BYTES, IMAGE_UPLOAD_MAX_HEIGHT, IMAGE_UPLOAD_MAX_PIXELS, IMAGE_UPLOAD_MAX_WIDTH, getAcceptedImageTypeLabel, formatBytesToMb } from '@/lib/image-upload-policy';
import { ChatMessage, ChatSummary, KidProfile, getMessageAttachments } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme-toggle';

function getFriendlyChatError(
  status: number,
  fallback: string,
  mode: 'chat' | 'image_understanding' | 'image_generation' | 'image_edit',
) {
  const actionText = mode === 'image_generation'
    ? '生成图片'
    : mode === 'image_edit'
      ? '修改图片'
      : mode === 'image_understanding'
        ? '解释图片'
        : '发送消息';

  if (status === 400) {
    return fallback || `${actionText}的请求好像有点问题，请检查后再试一次。`;
  }

  if (status === 403) {
    return fallback || `当前聊天入口暂时不允许${actionText}。`;
  }

  if (status === 502) {
    return fallback || `我现在暂时无法完成${actionText}，请稍后再试。`;
  }

  if (status >= 500) {
    return fallback || `服务器现在有点忙，暂时无法${actionText}，请稍后再试。`;
  }

  return fallback || `抱歉，刚才${actionText}失败了，请再试一次。`;
}

function detectTtsLanguage(text: string) {
  if (/[\u4e00-\u9fff]/.test(text)) return 'zh-CN';
  if (/[àâçéèêëîïôûùüÿœæ]/i.test(text) || /\b(bonjour|merci|petit|princesse|lapin|histoire)\b/i.test(text)) {
    return 'fr-CA';
  }
  return 'en-US';
}

function pickPreferredVoice(voices: SpeechSynthesisVoice[], lang: string, preferredVoiceLabel?: string) {
  const normalizedLang = lang.toLowerCase();
  const filtered = voices.filter((voice) => voice.lang.toLowerCase().startsWith(normalizedLang.split('-')[0] || normalizedLang));
  const pool = filtered.length ? filtered : voices;

  const preferredNamesByLang: Record<string, string[]> = {
    'zh-CN': ['tingting', 'mei-jia', 'sin-ji', 'xiaoxiao', 'yunxi', 'natural'],
    'fr-CA': ['amélie', 'amelie', 'thomas', 'audrey', 'chantal', 'natural'],
    'en-US': ['ava', 'samantha', 'victoria', 'allison', 'daniel', 'serena', 'natural'],
  };

  if (preferredVoiceLabel) {
    const exact = voices.find((voice) => `${voice.name} (${voice.lang})` === preferredVoiceLabel);
    if (exact) return exact;
  }

  const preferred = preferredNamesByLang[lang] || [];

  for (const keyword of preferred) {
    const found = pool.find((voice) => voice.name.toLowerCase().includes(keyword));
    if (found) return found;
  }

  const localService = pool.find((voice) => voice.localService);
  return localService || pool[0] || null;
}

function getTtsSettingsForLanguage(lang: string) {
  if (lang === 'zh-CN') {
    return { lang, rate: 0.9, pitch: 1.05, volume: 1 };
  }
  if (lang === 'fr-CA') {
    return { lang, rate: 0.92, pitch: 1.02, volume: 1 };
  }
  return { lang, rate: 0.94, pitch: 1, volume: 1 };
}

function stripMarkdownForTts(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^\)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^\)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6})\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*([-*+]|\d+\.)\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/\|/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();

    image.onload = () => {
      const result = { width: image.naturalWidth, height: image.naturalHeight };
      URL.revokeObjectURL(objectUrl);
      resolve(result);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('无法读取图片尺寸，请换一张图片再试。'));
    };

    image.src = objectUrl;
  });
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
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState('');
  const [composerMode, setComposerMode] = useState<'chat' | 'image_understanding' | 'image_generation' | 'image_edit'>('chat');
  const [lightboxImages, setLightboxImages] = useState<Array<{ url: string; alt: string }>>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [sending, setSending] = useState(false);
  const [pendingActionLabel, setPendingActionLabel] = useState('正在输入中');
  const [composerError, setComposerError] = useState('');
  const [creatingChat, setCreatingChat] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState('');
  const [ttsSupported, setTtsSupported] = useState(false);
  const [ttsVoices, setTtsVoices] = useState<SpeechSynthesisVoice[]>([]);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    setMessages(initialMessages);
    setDraft('');
    setPendingImage(null);
    setPendingImagePreview('');
    setComposerMode('chat');
    setComposerError('');
    setSending(false);
  }, [initialChatId, initialMessages]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
    setTtsSupported(supported);

    if (!supported) return;

    const loadVoices = () => {
      setTtsVoices(window.speechSynthesis.getVoices());
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.cancel();
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

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

  const lightboxOpen = lightboxImages.length > 0;
  const currentLightboxImage = lightboxOpen ? lightboxImages[lightboxIndex] : null;

  const closeLightbox = useCallback(() => {
    setLightboxImages([]);
    setLightboxIndex(0);
  }, []);

  const openLightbox = useCallback((images: Array<{ url: string; alt: string }>, index: number) => {
    setLightboxImages(images);
    setLightboxIndex(index);
  }, []);

  const showPrevLightboxImage = useCallback(() => {
    setLightboxIndex((prev) => (prev > 0 ? prev - 1 : lightboxImages.length - 1));
  }, [lightboxImages.length]);

  const showNextLightboxImage = useCallback(() => {
    setLightboxIndex((prev) => (prev < lightboxImages.length - 1 ? prev + 1 : 0));
  }, [lightboxImages.length]);

  useEffect(() => {
    if (typeof window === 'undefined' || !lightboxOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeLightbox();
      } else if (event.key === 'ArrowLeft' && lightboxImages.length > 1) {
        showPrevLightboxImage();
      } else if (event.key === 'ArrowRight' && lightboxImages.length > 1) {
        showNextLightboxImage();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [closeLightbox, lightboxOpen, lightboxImages.length, showNextLightboxImage, showPrevLightboxImage]);

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

  function onSpeakMessage(message: ChatMessage) {
    if (!ttsSupported || typeof window === 'undefined' || message.role !== 'assistant') return;

    if (speakingMessageId === message.id) {
      window.speechSynthesis.cancel();
      speechUtteranceRef.current = null;
      setSpeakingMessageId('');
      return;
    }

    window.speechSynthesis.cancel();

    const ttsText = stripMarkdownForTts(message.content);
    const detectedLang = detectTtsLanguage(ttsText);
    const settings = getTtsSettingsForLanguage(detectedLang);
    const utterance = new SpeechSynthesisUtterance(ttsText);
    const preferredVoice = pickPreferredVoice(ttsVoices, detectedLang, kid.tts?.preferredVoiceName);

    utterance.lang = settings.lang;
    utterance.rate = kid.tts?.rate ?? settings.rate;
    utterance.pitch = settings.pitch;
    utterance.volume = settings.volume;
    if (preferredVoice) {
      utterance.voice = preferredVoice;
      utterance.lang = preferredVoice.lang || settings.lang;
    }

    utterance.onend = () => {
      if (speechUtteranceRef.current === utterance) {
        speechUtteranceRef.current = null;
        setSpeakingMessageId('');
      }
    };
    utterance.onerror = () => {
      if (speechUtteranceRef.current === utterance) {
        speechUtteranceRef.current = null;
        setSpeakingMessageId('');
      }
    };

    speechUtteranceRef.current = utterance;
    setSpeakingMessageId(message.id);
    window.speechSynthesis.speak(utterance);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setComposerError('');
    const message = draft.trim();
    if ((!message && !pendingImage) || sending) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message || (pendingImage ? '请看看这张图片。' : ''),
      createdAt: '刚刚',
      attachments: pendingImagePreview
        ? [
            {
              kind: 'image_input',
              url: pendingImagePreview,
              contentType: pendingImage?.type,
              source: 'upload',
            },
          ]
        : undefined,
      attachment: pendingImagePreview
        ? {
            type: 'image',
            url: pendingImagePreview,
            contentType: pendingImage?.type,
          }
        : undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setDraft('');
    const imageToSend = pendingImage;
    const modeToSend = composerMode;
    const actionLabel = modeToSend === 'image_generation'
      ? '正在生成图片…'
      : modeToSend === 'image_edit'
        ? '正在修改图片…'
        : modeToSend === 'image_understanding'
          ? '正在解释图片…'
          : '正在输入中';
    setPendingImage(null);
    setPendingImagePreview('');
    setComposerMode('chat');
    setPendingActionLabel(actionLabel);
    setSending(true);

    try {
      const payload = new FormData();
      payload.set('kidId', kid.id);
      payload.set('chatId', initialChatId);
      payload.set('message', message);
      if (modeToSend === 'image_generation') {
        payload.set('mode', 'image_generation');
      } else if (modeToSend === 'image_edit' && imageToSend) {
        payload.set('mode', 'image_edit');
      } else if (modeToSend === 'image_understanding' && imageToSend) {
        payload.set('mode', 'image_understanding');
      } else if (imageToSend) {
        payload.set('mode', 'image_understanding');
      }
      if (imageToSend) {
        payload.set('image', imageToSend);
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        body: payload,
      });

      const data = (await response.json().catch(() => ({}))) as { reply?: ChatMessage; error?: string; uploadedImage?: { url: string; contentType?: string } | null };

      if (!response.ok) {
        throw new Error(getFriendlyChatError(response.status, data.error || '', modeToSend));
      }

      if (!data.reply) {
        throw new Error('服务器返回了空结果，请稍后再试。');
      }

      const reply = data.reply;
      setMessages((prev) => {
        const next = [...prev];
        const lastIndex = next.length - 1;
        if (lastIndex >= 0 && next[lastIndex]?.id === userMessage.id && data.uploadedImage?.url) {
          next[lastIndex] = {
            ...next[lastIndex],
            attachments: [
              {
                kind: 'image_input',
                url: data.uploadedImage.url,
                contentType: data.uploadedImage.contentType,
                source: 'upload',
              },
            ],
            attachment: {
              type: 'image',
              url: data.uploadedImage.url,
              contentType: data.uploadedImage.contentType,
            },
          };
        }
        next.push(reply);
        return next;
      });
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
      setPendingActionLabel('正在输入中');
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
                <p className="chat-welcome-text">{kid.welcome}</p>
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
            messages.map((message) => {
              const imageAttachments = getMessageAttachments(message).filter(
                (attachment) => attachment.kind === 'image_input' || attachment.kind === 'image_generated',
              );
              const referenceAttachments = imageAttachments.filter((attachment) => attachment.source === 'reference');
              const generatedAttachments = imageAttachments.filter((attachment) => attachment.kind === 'image_generated');
              const showImageCompare = referenceAttachments.length > 0 && generatedAttachments.length > 0;
              const editPrompt = showImageCompare
                ? referenceAttachments.find((attachment) => attachment.prompt)?.prompt || generatedAttachments.find((attachment) => attachment.prompt)?.prompt || ''
                : '';
              const displayAttachments = showImageCompare ? [...referenceAttachments, ...generatedAttachments] : imageAttachments;
              const lightboxItems = displayAttachments.map((attachment) => ({
                url: attachment.url,
                alt: attachment.kind === 'image_generated' ? '生成的图片' : attachment.source === 'reference' ? '参考图片' : '上传的图片',
              }));

              return (
                <article
                key={message.id}
                className={cn('message', message.role)}
                style={
                  message.role === 'user'
                    ? { background: `${kid.accentColor}22`, borderColor: `${kid.accentColor}40` }
                    : undefined
                }
              >
                <div className="message-body-row">
                  <div className="message-text">
                    {showImageCompare ? (
                      <div className="message-image-compare-card">
                        <div className="message-image-compare-header">
                          <div className="message-image-compare-title">改图结果</div>
                          {editPrompt ? <div className="message-image-compare-prompt">{editPrompt}</div> : null}
                        </div>
                        <div className="message-image-compare-grid">
                          <div className="message-image-compare-column">
                            <div className="message-image-compare-label">原图</div>
                            {referenceAttachments.map((attachment, index) => (
                              <div key={`${attachment.url}-${index}`} className="message-image-wrap">
                                <button
                                  type="button"
                                  className="message-image-button"
                                  onClick={() => {
                                    openLightbox(lightboxItems, index);
                                  }}
                                >
                                  <Image src={attachment.url} alt="参考图片" className="message-image" width={320} height={280} unoptimized />
                                </button>
                              </div>
                            ))}
                          </div>

                          <div className="message-image-compare-arrow" aria-hidden="true">→</div>

                          <div className="message-image-compare-column">
                            <div className="message-image-compare-label">改后图</div>
                            {generatedAttachments.map((attachment, index) => (
                              <div key={`${attachment.url}-${index}`} className="message-image-wrap">
                                <button
                                  type="button"
                                  className="message-image-button"
                                  onClick={() => {
                                    openLightbox(lightboxItems, referenceAttachments.length + index);
                                  }}
                                >
                                  <Image src={attachment.url} alt="生成的图片" className="message-image" width={320} height={280} unoptimized />
                                </button>
                                {attachment.model || attachment.provider ? (
                                  <div className="message-image-meta">
                                    生成模型：{attachment.model || 'unknown'}
                                    {attachment.provider ? ` · Provider: ${attachment.provider}` : ''}
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : imageAttachments.length > 0 ? (
                      <div className="message-image-gallery">
                        {imageAttachments.map((attachment, index) => (
                          <div key={`${attachment.url}-${index}`} className="message-image-wrap">
                            <button
                              type="button"
                              className="message-image-button"
                              onClick={() => {
                                openLightbox(lightboxItems, index);
                              }}
                            >
                              <Image
                                src={attachment.url}
                                alt={attachment.kind === 'image_generated' ? '生成的图片' : attachment.source === 'reference' ? '参考图片' : '上传的图片'}
                                className="message-image"
                                width={320}
                                height={280}
                                unoptimized
                              />
                            </button>
                            {attachment.source === 'reference' ? (
                              <div className="message-image-meta">参考图片</div>
                            ) : null}
                            {attachment.kind === 'image_generated' && (attachment.model || attachment.provider) ? (
                              <div className="message-image-meta">
                                生成模型：{attachment.model || 'unknown'}
                                {attachment.provider ? ` · Provider: ${attachment.provider}` : ''}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {message.role === 'assistant' ? (
                      <div className="message-markdown">
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <div className="message-plain-text">{message.content}</div>
                    )}
                  </div>
                  {message.role === 'assistant' && ttsSupported && kid.tts?.enabled !== false ? (
                    <button
                      type="button"
                      className={speakingMessageId === message.id ? 'tts-button active' : 'tts-button'}
                      onClick={() => onSpeakMessage(message)}
                      aria-label={speakingMessageId === message.id ? '停止朗读' : '朗读回复'}
                      title={speakingMessageId === message.id ? '停止朗读' : '朗读回复'}
                    >
                      {speakingMessageId === message.id ? '⏹️' : '🔊'}
                    </button>
                  ) : null}
                </div>
                <time>{message.createdAt}</time>
                </article>
              );
            })
          )}

          {sending ? (
            <article className="message assistant message-thinking" aria-live="polite" aria-busy="true">
              <div className="thinking-bubble">
                <span className="thinking-label">{pendingActionLabel}</span>
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

        {lightboxOpen && currentLightboxImage ? (
          <div
            className="lightbox-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="图片原尺寸预览"
            onClick={closeLightbox}
          >
            <div
              className="lightbox-content"
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="lightbox-toolbar">
                <div className="lightbox-hint">
                  {lightboxImages.length > 1 ? `第 ${lightboxIndex + 1} / ${lightboxImages.length} 张 · 可用左右方向键切换` : '点击空白处或按 Esc 关闭'}
                </div>
                <div className="lightbox-actions">
                  <a
                    href={currentLightboxImage.url}
                    target="_blank"
                    rel="noreferrer"
                    className="lightbox-action-button"
                  >
                    打开原图
                  </a>
                  <a
                    href={currentLightboxImage.url}
                    download
                    className="lightbox-action-button"
                  >
                    下载
                  </a>
                  <button
                    type="button"
                    className="lightbox-close"
                    onClick={closeLightbox}
                    aria-label="关闭图片预览"
                  >
                    ×
                  </button>
                </div>
              </div>

              {lightboxImages.length > 1 ? (
                <button
                  type="button"
                  className="lightbox-nav lightbox-nav-prev"
                  onClick={showPrevLightboxImage}
                  aria-label="查看上一张图片"
                >
                  ‹
                </button>
              ) : null}

              <Image src={currentLightboxImage.url} alt={currentLightboxImage.alt} className="lightbox-image" width={1600} height={1200} unoptimized />

              {lightboxImages.length > 1 ? (
                <button
                  type="button"
                  className="lightbox-nav lightbox-nav-next"
                  onClick={showNextLightboxImage}
                  aria-label="查看下一张图片"
                >
                  ›
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="composer">
          <form onSubmit={onSubmit}>
            <div className="composer-main">
              {pendingImagePreview ? (
                <div className="composer-image-preview">
                  <Image src={pendingImagePreview} alt="待发送图片预览" className="composer-image-thumb" width={88} height={88} unoptimized />
                  <button type="button" className="composer-image-remove" onClick={() => { setPendingImage(null); setPendingImagePreview(''); setComposerError(''); setComposerMode('chat'); }}>
                    移除图片
                  </button>
                </div>
              ) : null}
              <div className="env-admin-note">上传限制：仅支持 {getAcceptedImageTypeLabel()}，单张不超过 {formatBytesToMb(IMAGE_UPLOAD_MAX_BYTES)}，尺寸不超过 {IMAGE_UPLOAD_MAX_WIDTH}×{IMAGE_UPLOAD_MAX_HEIGHT}，总像素不超过 {(IMAGE_UPLOAD_MAX_PIXELS / 1_000_000).toFixed(0)}MP。</div>
              {composerError ? <div className="runtime-check-issues"><strong>上传失败：</strong> {composerError}</div> : null}
              {composerMode === 'image_edit' && !pendingImagePreview ? (
                <div className="env-admin-note">请先上传一张参考图片，再描述你想怎么修改它。</div>
              ) : null}
              {composerMode === 'image_understanding' && !pendingImagePreview ? (
                <div className="env-admin-note">请先上传一张图片，再让我帮你解释图片内容。</div>
              ) : null}
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={sending ? '正在等待回复…' : composerMode === 'image_generation' ? '描述你想生成的图片…' : composerMode === 'image_edit' ? '描述你想如何修改这张图片…' : composerMode === 'image_understanding' ? '问问我这张图片里有什么…' : '输入想说的话，或者发一张图片…'}
                disabled={sending}
              />
            </div>
            <div className="composer-mode-row">
              <div className="composer-mode-tabs" role="tablist" aria-label="消息模式选择" style={{ ['--composer-accent' as string]: kid.accentColor }}>
                <button
                  type="button"
                  className={composerMode === 'chat' ? 'composer-mode-tab active' : 'composer-mode-tab'}
                  onClick={() => setComposerMode('chat')}
                  disabled={sending}
                >
                  <span className="composer-mode-tab-emoji">💬</span>
                  <span>聊天</span>
                </button>
                {kid.capabilities?.imageUnderstanding !== false ? (
                  <button
                    type="button"
                    className={composerMode === 'image_understanding' ? 'composer-mode-tab active' : 'composer-mode-tab'}
                    onClick={() => setComposerMode('image_understanding')}
                    disabled={sending}
                  >
                    <span className="composer-mode-tab-emoji">👀</span>
                    <span>解释图片</span>
                  </button>
                ) : null}
                {kid.capabilities?.imageGeneration !== false ? (
                  <button
                    type="button"
                    className={composerMode === 'image_generation' ? 'composer-mode-tab active' : 'composer-mode-tab'}
                    onClick={() => {
                      setComposerMode('image_generation');
                      setPendingImage(null);
                      setPendingImagePreview('');
                    }}
                    disabled={sending}
                  >
                    <span className="composer-mode-tab-emoji">🎨</span>
                    <span>生成图片</span>
                  </button>
                ) : null}
                {kid.capabilities?.imageEdit === true ? (
                  <button
                    type="button"
                    className={composerMode === 'image_edit' ? 'composer-mode-tab active' : 'composer-mode-tab'}
                    onClick={() => setComposerMode('image_edit')}
                    disabled={sending}
                  >
                    <span className="composer-mode-tab-emoji">🪄</span>
                    <span>参考图改图</span>
                  </button>
                ) : null}
              </div>
              <div className="composer-mode-hint">
                {composerMode === 'image_generation'
                  ? '当前模式：直接根据文字生成新图片'
                  : composerMode === 'image_edit'
                    ? '当前模式：上传一张参考图，再描述你想怎么修改它'
                    : composerMode === 'image_understanding'
                      ? '当前模式：上传一张图片，让我解释图片内容'
                      : '当前模式：普通聊天'}
              </div>
            </div>

            <div className="composer-actions">
              {kid.capabilities?.imageUnderstanding !== false ? (
                <label className={composerMode === 'image_generation' ? 'image-upload-button disabled' : 'image-upload-button'}>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    hidden
                    onChange={async (event) => {
                      const file = event.target.files?.[0] || null;

                      if (!file) {
                        setPendingImage(null);
                        setPendingImagePreview('');
                        setComposerError('');
                        event.currentTarget.value = '';
                        return;
                      }

                      if (!IMAGE_UPLOAD_ACCEPTED_TYPES.includes(file.type as typeof IMAGE_UPLOAD_ACCEPTED_TYPES[number])) {
                        setPendingImage(null);
                        setPendingImagePreview('');
                        setComposerError(`只支持 ${getAcceptedImageTypeLabel()} 图片。`);
                        event.currentTarget.value = '';
                        return;
                      }

                      if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
                        setPendingImage(null);
                        setPendingImagePreview('');
                        setComposerError(`图片不能超过 ${formatBytesToMb(IMAGE_UPLOAD_MAX_BYTES)}。`);
                        event.currentTarget.value = '';
                        return;
                      }

                      try {
                        const { width, height } = await readImageDimensions(file);
                        if (width > IMAGE_UPLOAD_MAX_WIDTH || height > IMAGE_UPLOAD_MAX_HEIGHT) {
                          setPendingImage(null);
                          setPendingImagePreview('');
                          setComposerError(`图片尺寸不能超过 ${IMAGE_UPLOAD_MAX_WIDTH}×${IMAGE_UPLOAD_MAX_HEIGHT}。`);
                          event.currentTarget.value = '';
                          return;
                        }

                        if (width * height > IMAGE_UPLOAD_MAX_PIXELS) {
                          setPendingImage(null);
                          setPendingImagePreview('');
                          setComposerError(`图片像素总量不能超过 ${(IMAGE_UPLOAD_MAX_PIXELS / 1_000_000).toFixed(0)}MP。`);
                          event.currentTarget.value = '';
                          return;
                        }
                      } catch (error) {
                        setPendingImage(null);
                        setPendingImagePreview('');
                        setComposerError(error instanceof Error ? error.message : '无法读取图片尺寸，请换一张图片再试。');
                        event.currentTarget.value = '';
                        return;
                      }

                      setComposerError('');
                      setPendingImage(file);
                      setPendingImagePreview(URL.createObjectURL(file));
                      if (composerMode === 'chat') {
                        setComposerMode('image_understanding');
                      }
                      event.currentTarget.value = '';
                    }}
                    disabled={sending || composerMode === 'image_generation'}
                  />
                  {composerMode === 'image_edit' ? '上传参考图' : composerMode === 'image_understanding' ? '上传待解释图片' : '选图片'}
                </label>
              ) : null}
              <button
                type="submit"
                style={{ background: kid.accentColor }}
                disabled={sending || ((composerMode === 'image_edit' || composerMode === 'image_understanding') && !pendingImage)}
              >
                {sending ? '发送中' : composerMode === 'image_generation' ? '生成图片' : composerMode === 'image_edit' ? '开始改图' : composerMode === 'image_understanding' ? '解释图片' : '发送'}
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
