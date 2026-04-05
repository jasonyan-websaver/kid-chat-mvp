'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { formatBytesToMb, getAcceptedImageTypeLabel } from '@/lib/image-upload-policy';
import { getUnknownProfileKeysFromJson } from '@/lib/profile-schema';

type TabKey = 'memory' | 'profile' | 'env' | 'text' | 'history' | 'tts';

type AdminChatSummary = {
  id: string;
  title: string;
  updatedAt: string;
  preview: string;
};

type AdminChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

type AdminKid = {
  id: string;
  name: string;
  emoji?: string;
  memory: string;
  profile: string;
  chats: AdminChatSummary[];
  messagesByChat: Record<string, AdminChatMessage[]>;
};

type RuntimeKidCheck = {
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

type RuntimeCheck = {
  mode: 'mock' | 'real';
  openclawUseMock: string;
  pm2Name: string;
  kids: RuntimeKidCheck[];
  imageGeneration: {
    provider: string;
    model: string;
    hasGeminiApiKey: boolean;
    hasGeminiImageModel: boolean;
    uploadMaxBytes: number;
    uploadMaxWidth: number;
    uploadMaxHeight: number;
    uploadMaxPixels: number;
    uploadMinIntervalMs: number;
    acceptedMimeTypes: string[];
    issues: string[];
  };
  issues: string[];
};

type EnvValues = {
  kidPins: Record<string, string>;
  adminPin: string;
  useMock: string;
  pm2Name: string;
  imageProvider: 'media-agent' | 'gemini-direct' | 'inference-sh';
  imageModel: string;
};

type KidMediaStorageStat = {
  kidId: string;
  fileCount: number;
  totalBytes: number;
  latestModifiedAt: string | null;
};

type MediaStorageSummary = {
  rootPath: string;
  totalFileCount: number;
  totalBytes: number;
  kids: KidMediaStorageStat[];
};

type SmokeTestEntry = {
  key: 'chain' | 'media-agent' | 'gemini-direct';
  label: string;
  ok: boolean;
  message: string;
  provider?: string;
  model?: string;
  imageCount?: number;
  elapsedMs?: number;
  ranAt: string;
};

type SmokeTestLog = {
  imageGeneration: Record<string, SmokeTestEntry | undefined>;
};

type TextSettings = Record<string, {
  name: string;
  emoji: string;
  accentColor: string;
  title: string;
  welcome: string;
  ttsEnabled: boolean;
  ttsPreferredVoiceName: string;
  ttsRate: number;
  imageGenerationEnabled: boolean;
  imageUnderstandingEnabled: boolean;
  imageEditEnabled: boolean;
}>;

type ProfileFormState = {
  name: string;
  ageGroup: string;
  languages: string;
  likes: string;
  learningGoals: string;
  tone: string;
  responseStyle: string;
  avoid: string;
  notes: string;
};

type HistoryRange = 'all' | '7d' | 'today';

const COMMON_EMOJIS = ['🌸', '🚀', '🦄', '🐼', '🐱', '🐶', '⭐', '🎨', '📚', '🧠', '🦋', '🌈'];

function getPreferredVoiceKeywords(lang: string) {
  if (lang === 'zh-CN') return ['tingting', 'mei-jia', 'sin-ji', 'xiaoxiao', 'yunxi', 'natural'];
  if (lang === 'fr-CA') return ['amélie', 'amelie', 'thomas', 'audrey', 'chantal', 'natural'];
  return ['ava', 'samantha', 'victoria', 'allison', 'daniel', 'serena', 'natural'];
}

function getExpectedVoiceLang(kidName: string) {
  const normalized = kidName.toLowerCase();
  if (normalized.includes('grace')) return 'zh-CN';
  if (normalized.includes('george')) return 'zh-CN';
  return 'zh-CN';
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getCapabilityStateText(enabled: boolean) {
  return enabled ? '已开启' : '已关闭';
}

function getCapabilitySummary(setting: { imageGenerationEnabled: boolean; imageUnderstandingEnabled: boolean; imageEditEnabled: boolean; ttsEnabled: boolean }) {
  return [
    `解释图片：${getCapabilityStateText(setting.imageUnderstandingEnabled !== false)}`,
    `生成图片：${getCapabilityStateText(setting.imageGenerationEnabled !== false)}`,
    `参考图改图：${getCapabilityStateText(setting.imageEditEnabled === true)}`,
    `手动朗读：${getCapabilityStateText(setting.ttsEnabled !== false)}`,
  ];
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatLocalDateTime(value?: string | null) {
  if (!value) return '尚未运行';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN');
}

function isWithinHistoryRange(updatedAt: string, range: HistoryRange) {
  if (range === 'all') return true;

  const target = new Date(updatedAt);
  if (Number.isNaN(target.getTime())) return true;

  const now = new Date();

  if (range === 'today') {
    return target.getFullYear() === now.getFullYear() &&
      target.getMonth() === now.getMonth() &&
      target.getDate() === now.getDate();
  }

  const diffMs = now.getTime() - target.getTime();
  return diffMs <= 7 * 24 * 60 * 60 * 1000;
}

function emptyProfileForm(): ProfileFormState {
  return {
    name: '',
    ageGroup: '',
    languages: '',
    likes: '',
    learningGoals: '',
    tone: '',
    responseStyle: '',
    avoid: '',
    notes: '',
  };
}

function toLineList(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function profileJsonToForm(raw: string): ProfileFormState {
  try {
    const parsed = raw.trim() ? JSON.parse(raw) as Record<string, unknown> : {};
    const asLines = (value: unknown) => Array.isArray(value) ? value.map((item) => String(item)).join('\n') : '';

    return {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      ageGroup: typeof parsed.ageGroup === 'string' ? parsed.ageGroup : '',
      languages: asLines(parsed.languages),
      likes: asLines(parsed.likes),
      learningGoals: asLines(parsed.learningGoals),
      tone: typeof parsed.tone === 'string' ? parsed.tone : '',
      responseStyle: asLines(parsed.responseStyle),
      avoid: asLines(parsed.avoid),
      notes: asLines(parsed.notes),
    };
  } catch {
    return emptyProfileForm();
  }
}

function profileFormToJson(form: ProfileFormState) {
  const payload = {
    name: form.name.trim(),
    ageGroup: form.ageGroup.trim(),
    languages: toLineList(form.languages),
    likes: toLineList(form.likes),
    learningGoals: toLineList(form.learningGoals),
    tone: form.tone.trim(),
    responseStyle: toLineList(form.responseStyle),
    avoid: toLineList(form.avoid),
    notes: toLineList(form.notes),
  };

  return JSON.stringify(payload, null, 2);
}

function renderHighlightedText(text: string, query: string) {
  const keyword = query.trim();
  if (!keyword) return text;

  const parts = text.split(new RegExp(`(${escapeRegExp(keyword)})`, 'ig'));
  return parts.map((part, index) =>
    part.toLowerCase() === keyword.toLowerCase() ? <mark key={`${part}-${index}`}>{part}</mark> : part,
  );
}

export function AdminPanel(props: { kids: AdminKid[]; envValues: EnvValues; textSettings: TextSettings; runtimeCheck: RuntimeCheck; mediaStorage: MediaStorageSummary; smokeTests: SmokeTestLog }) {
  const [activeKid, setActiveKid] = useState(props.kids[0]?.id || '');
  const [activeTab, setActiveTab] = useState<TabKey>('memory');
  const [saving, setSaving] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [agentCheckingKidId, setAgentCheckingKidId] = useState('');
  const [imageRuntimeChecking, setImageRuntimeChecking] = useState(false);
  const [imageSmokeTesting, setImageSmokeTesting] = useState(false);
  const [mediaSmokeTesting, setMediaSmokeTesting] = useState(false);
  const [geminiSmokeTesting, setGeminiSmokeTesting] = useState(false);
  const [mediaStorageRefreshing, setMediaStorageRefreshing] = useState(false);
  const [mediaStorageCleaningKidId, setMediaStorageCleaningKidId] = useState('');
  const [ttsPreviewingKidId, setTtsPreviewingKidId] = useState('');
  const [profileEditorMode, setProfileEditorMode] = useState<'json' | 'form'>('json');
  const [allowUnknownProfileFields, setAllowUnknownProfileFields] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<Array<{ value: string; label: string }>>([]);
  const [historyRangeByKid, setHistoryRangeByKid] = useState<Record<string, HistoryRange>>(() =>
    Object.fromEntries(props.kids.map((kid) => [kid.id, 'all'])),
  );
  const [historyQueryByKid, setHistoryQueryByKid] = useState<Record<string, string>>(() =>
    Object.fromEntries(props.kids.map((kid) => [kid.id, ''])),
  );
  const [selectedChatIdByKid, setSelectedChatIdByKid] = useState<Record<string, string>>(() =>
    Object.fromEntries(props.kids.map((kid) => [kid.id, kid.chats[0]?.id || ''])),
  );
  const [profileForm, setProfileForm] = useState<ProfileFormState>(emptyProfileForm);
  const [status, setStatus] = useState('');
  const [mediaSmokePreviewUrl, setMediaSmokePreviewUrl] = useState('');
  const [mediaSmokePreviewAlt, setMediaSmokePreviewAlt] = useState('');
  const [geminiSmokePreviewUrl, setGeminiSmokePreviewUrl] = useState('');
  const [geminiSmokePreviewAlt, setGeminiSmokePreviewAlt] = useState('');
  const [kidContent, setKidContent] = useState<Record<string, { memory: string; profile: string }>>(
    () =>
      Object.fromEntries(
        props.kids.map((kid) => [kid.id, { memory: kid.memory, profile: kid.profile }]),
      ),
  );
  const [envValues, setEnvValues] = useState<EnvValues>(props.envValues);
  const [textSettings, setTextSettings] = useState<TextSettings>(props.textSettings);
  const [mediaStorage, setMediaStorage] = useState<MediaStorageSummary>(props.mediaStorage);

  const activeKidData = useMemo(() => props.kids.find((kid) => kid.id === activeKid) ?? props.kids[0] ?? null, [props.kids, activeKid]);

  const currentValue = useMemo(() => {
    if (!activeKidData || activeTab === 'env' || activeTab === 'text') return '';
    const current = kidContent[activeKidData.id];
    return activeTab === 'memory' ? current?.memory || '' : current?.profile || '';
  }, [activeKidData, activeTab, kidContent]);

  const unknownProfileKeys = useMemo(() => {
    if (activeTab !== 'profile' || profileEditorMode !== 'json') return [] as string[];
    return getUnknownProfileKeysFromJson(currentValue);
  }, [activeTab, profileEditorMode, currentValue]);

  const historyQuery = activeKidData ? historyQueryByKid[activeKidData.id] || '' : '';
  const historyRange = activeKidData ? historyRangeByKid[activeKidData.id] || 'all' : 'all';
  const activeKidSettings = activeKid ? textSettings[activeKid] : undefined;
  const imageRuntimeHealthy = props.runtimeCheck.imageGeneration.issues.length === 0;
  const activeKidMediaStorage = activeKid ? mediaStorage.kids.find((kid) => kid.kidId === activeKid) : undefined;
  const smokeTestEntries = Object.values(props.smokeTests.imageGeneration).filter(Boolean) as SmokeTestEntry[];

  const filteredChats = useMemo(() => {
    if (!activeKidData) return [] as AdminChatSummary[];

    const keyword = historyQuery.trim().toLowerCase();

    return activeKidData.chats.filter((chat) => {
      const withinRange = isWithinHistoryRange(chat.updatedAt, historyRange);
      if (!withinRange) return false;

      if (!keyword) return true;
      const haystack = [
        chat.title,
        chat.preview,
        ...(activeKidData.messagesByChat[chat.id] || []).map((message) => message.content),
      ]
        .join('\n')
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }, [activeKidData, historyQuery, historyRange]);

  const activeChatId = activeKidData ? selectedChatIdByKid[activeKidData.id] || filteredChats[0]?.id || activeKidData.chats[0]?.id || '' : '';
  const activeChatMessages = activeKidData ? activeKidData.messagesByChat[activeChatId] || [] : [];

  useEffect(() => {
    if (activeTab !== 'profile') return;
    setProfileForm(profileJsonToForm(currentValue));
  }, [activeTab, activeKid, currentValue]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      const lang = getExpectedVoiceLang(activeKidData?.name || '');
      const preferredKeywords = getPreferredVoiceKeywords(lang);

      const items = voices.map((voice) => {
        const tags: string[] = [];
        if (voice.default) tags.push('默认');
        if (voice.localService) tags.push('本机');
        if (voice.lang.toLowerCase().startsWith(lang.toLowerCase().split('-')[0] || lang.toLowerCase())) tags.push('语言匹配');
        if (preferredKeywords.some((keyword) => voice.name.toLowerCase().includes(keyword))) tags.push('推荐');

        return {
          value: `${voice.name} (${voice.lang})`,
          label: `${voice.name} (${voice.lang})${tags.length ? ` — ${tags.join(' · ')}` : ''}`,
        };
      });

      const deduped = Array.from(new Map(items.map((item) => [item.value, item])).values());
      deduped.sort((a, b) => a.label.localeCompare(b.label));
      setAvailableVoices(deduped);
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [activeKidData?.name]);

  function setCurrentValue(value: string) {
    if (!activeKidData || activeTab === 'env' || activeTab === 'text') return;
    setKidContent((prev) => ({
      ...prev,
      [activeKidData.id]: {
        memory: activeTab === 'memory' ? value : prev[activeKidData.id]?.memory || '',
        profile: activeTab === 'profile' ? value : prev[activeKidData.id]?.profile || '',
      },
    }));
  }

  function setProfileFormField(field: keyof ProfileFormState, value: string) {
    setProfileForm((prev) => {
      const next = {
        ...prev,
        [field]: value,
      };

      if (activeTab === 'profile' && activeKidData) {
        setCurrentValue(profileFormToJson(next));
      }

      return next;
    });
  }

  function setKidPin(kidId: string, value: string) {
    setEnvValues((prev) => ({
      ...prev,
      kidPins: {
        ...prev.kidPins,
        [kidId]: value.replace(/\D/g, '').slice(0, 12),
      },
    }));
  }

  function setKidText(kidId: string, field: 'name' | 'emoji' | 'accentColor' | 'title' | 'welcome' | 'ttsPreferredVoiceName', value: string) {
    setTextSettings((prev) => ({
      ...prev,
      [kidId]: {
        ...prev[kidId],
        [field]: value,
      },
    }));
  }

  function setKidTts(kidId: string, field: 'ttsEnabled' | 'ttsRate', value: boolean | number) {
    setTextSettings((prev) => ({
      ...prev,
      [kidId]: {
        ...prev[kidId],
        [field]: value,
      },
    }));
  }

  function setKidCapability(kidId: string, field: 'imageGenerationEnabled' | 'imageUnderstandingEnabled' | 'imageEditEnabled', value: boolean) {
    setTextSettings((prev) => ({
      ...prev,
      [kidId]: {
        ...prev[kidId],
        [field]: value,
      },
    }));
  }

  async function onCheckImageRuntime() {
    setImageRuntimeChecking(true);
    setStatus('');

    try {
      const response = await fetch('/api/runtime-check-image');
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '图片生成运行时检查失败');
      }
      setStatus(data.message || '图片生成运行时检查完成。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '图片生成运行时检查失败');
    } finally {
      setImageRuntimeChecking(false);
    }
  }

  async function onRunImageSmokeTest() {
    setImageSmokeTesting(true);
    setStatus('');

    try {
      const response = await fetch('/api/runtime-check-image-smoke', {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '图片生成 smoke test 失败');
      }
      const debug = data.debug ? `\n\n调试信息：${JSON.stringify(data.debug)}` : '';
      setStatus((data.message || '图片生成 smoke test 成功。') + debug);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '图片生成 smoke test 失败');
    } finally {
      setImageSmokeTesting(false);
    }
  }

  async function onRunMediaSmokeTest() {
    setMediaSmokeTesting(true);
    setStatus('');
    setMediaSmokePreviewUrl('');
    setMediaSmokePreviewAlt('');

    try {
      const response = await fetch('/api/runtime-check-image-media', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        const debug = data.debug ? `\n\n调试信息：${JSON.stringify(data.debug)}` : '';
        throw new Error((data.error || '智媒 smoke test 失败') + debug);
      }
      const debug = data.debug ? `\n\n调试信息：${JSON.stringify(data.debug)}` : '';
      setStatus((data.message || '智媒 smoke test 成功。') + debug);
      if (typeof data.firstImagePreview === 'string' && data.firstImagePreview.trim()) {
        setMediaSmokePreviewUrl(data.firstImagePreview);
        setMediaSmokePreviewAlt(typeof data.prompt === 'string' && data.prompt.trim() ? data.prompt : '智媒 smoke test 预览图');
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '智媒 smoke test 失败');
    } finally {
      setMediaSmokeTesting(false);
    }
  }

  async function onRunGeminiSmokeTest() {
    setGeminiSmokeTesting(true);
    setStatus('');
    setGeminiSmokePreviewUrl('');
    setGeminiSmokePreviewAlt('');

    try {
      const response = await fetch('/api/runtime-check-image-gemini', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Gemini direct smoke test 失败');
      }
      const debug = data.debug ? `\n\n调试信息：${JSON.stringify(data.debug)}` : '';
      setStatus((data.message || 'Gemini direct smoke test 成功。') + debug);
      if (typeof data.firstImagePreview === 'string' && data.firstImagePreview.trim()) {
        setGeminiSmokePreviewUrl(data.firstImagePreview);
        setGeminiSmokePreviewAlt(typeof data.prompt === 'string' && data.prompt.trim() ? data.prompt : 'Gemini direct smoke test 预览图');
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Gemini direct smoke test 失败');
    } finally {
      setGeminiSmokeTesting(false);
    }
  }

  async function onRefreshMediaStorage() {
    setMediaStorageRefreshing(true);
    setStatus('');

    try {
      const response = await fetch('/api/media-storage');
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '读取本地图片占用失败');
      }
      setMediaStorage(data);
      setStatus('已刷新本地图片占用统计。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '读取本地图片占用失败');
    } finally {
      setMediaStorageRefreshing(false);
    }
  }

  async function onCleanupKidMediaStorage(kidId: string) {
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(`确定要清理 ${kidId} 的本地图片缓存吗？此操作会删除该孩子当前保存的上传图和生成图。`);
      if (!confirmed) return;
    }

    setMediaStorageCleaningKidId(kidId);
    setStatus('');

    try {
      const response = await fetch('/api/media-storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kidId }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '清理本地图片缓存失败');
      }
      setMediaStorage(data.summary);
      setStatus(data.message || `已清理 ${kidId} 的本地图片缓存。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '清理本地图片缓存失败');
    } finally {
      setMediaStorageCleaningKidId('');
    }
  }

  async function onSave() {
    setSaving(true);
    setStatus('');

    try {
      if (activeTab === 'env') {
        const response = await fetch('/api/admin-env', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(envValues),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || '保存失败');
        }

        setStatus(data.message || '环境变量已保存，重启服务后生效。');
        return;
      }

      if (activeTab === 'text' || activeTab === 'tts') {
        const response = await fetch('/api/kid-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(textSettings),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || '保存失败');
        }

        setStatus(activeTab === 'tts' ? (data.message || 'TTS 设置已保存。') : (data.message || '孩子标题和欢迎语已保存。'));
        return;
      }

      if (!activeKidData) {
        throw new Error('未知孩子');
      }

      const endpoint = activeTab === 'memory' ? '/api/memory' : '/api/profile';
      const payload = activeTab === 'profile'
        ? { kidId: activeKidData.id, content: currentValue, allowUnknownFields: profileEditorMode === 'json' && allowUnknownProfileFields }
        : { kidId: activeKidData.id, content: currentValue };
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || '保存失败');
      }

      setStatus(activeTab === 'memory' ? '记忆已保存' : '资料已保存');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function onRestartService() {
    setRestarting(true);
    setStatus('');

    try {
      const response = await fetch('/api/restart-service', {
        method: 'POST',
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || '重启失败');
      }

      setStatus(data.message || '服务正在重启，请稍等几秒后刷新页面。');
      setTimeout(() => {
        window.location.reload();
      }, 5000);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '重启失败');
      setRestarting(false);
    }
  }

  async function onSignOut() {
    setSigningOut(true);
    setStatus('');

    try {
      const response = await fetch('/api/clear-admin-pin', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('退出失败');
      }

      window.location.href = '/';
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '退出失败');
      setSigningOut(false);
    }
  }

  async function onCheckAgent(kidId: string) {
    setAgentCheckingKidId(kidId);
    setStatus('');

    try {
      const response = await fetch('/api/runtime-check-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kidId }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'agent 连通性测试失败');
      }

      setStatus(data.message || 'agent 连通性测试通过。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'agent 连通性测试失败');
    } finally {
      setAgentCheckingKidId('');
    }
  }

  function onPreviewTts(kidId: string) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setStatus('当前浏览器不支持 TTS 试听。');
      return;
    }

    const current = textSettings[kidId];
    if (!current?.ttsEnabled) {
      setStatus('当前孩子的 TTS 已关闭，无法试听。');
      return;
    }

    if (ttsPreviewingKidId === kidId) {
      window.speechSynthesis.cancel();
      setTtsPreviewingKidId('');
      setStatus('已停止 TTS 试听。');
      return;
    }

    const voices = window.speechSynthesis.getVoices();
    const selectedVoice = current.ttsPreferredVoiceName
      ? voices.find((voice) => `${voice.name} (${voice.lang})` === current.ttsPreferredVoiceName)
      : null;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(`你好，${current.name}。这是语音试听。现在的语速是 ${(current.ttsRate ?? 0.9).toFixed(2)}。`);
    utterance.rate = current.ttsRate ?? 0.9;
    utterance.pitch = 1.02;
    utterance.volume = 1;
    utterance.lang = selectedVoice?.lang || 'zh-CN';
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
    utterance.onend = () => {
      setTtsPreviewingKidId('');
    };
    utterance.onerror = () => {
      setTtsPreviewingKidId('');
      setStatus('TTS 试听失败，请换一个 voice 再试。');
    };

    setTtsPreviewingKidId(kidId);
    setStatus(selectedVoice ? `正在试听：${selectedVoice.name}（${selectedVoice.lang}）` : '正在试听自动选择的语音。');
    window.speechSynthesis.speak(utterance);
  }

  return (
    <main className="shell home memory-admin-page">
      <section className="hero hero-kids">
        <div className="hero-topbar">
          <div>
            <h1>家长管理</h1>
            <p>管理每个孩子的家长资料层、智能体记忆层、标题欢迎语和 PIN 环境变量。</p>
          </div>
          <div className="admin-header-actions">
            <button className="admin-secondary-button" onClick={onSignOut} disabled={signingOut || restarting}>
              {signingOut ? '退出中…' : '退出家长管理'}
            </button>
            <ThemeToggle />
          </div>
        </div>
      </section>

      <section className="runtime-check-panel">
        <div className={props.runtimeCheck.issues.length ? 'runtime-check-card runtime-check-card-warning' : 'runtime-check-card'}>
          <div className="runtime-check-header">
            <strong>运行环境自检</strong>
            <span>{props.runtimeCheck.mode === 'real' ? '真实模式' : '模拟模式'}</span>
          </div>

          <div className="runtime-check-summary">
            <div><strong>OPENCLAW_USE_MOCK:</strong> {props.runtimeCheck.openclawUseMock}</div>
            <div><strong>PM2 服务名:</strong> {props.runtimeCheck.pm2Name}</div>
            <div><strong>图片后端状态:</strong> {imageRuntimeHealthy ? '✅ 可用' : '⚠️ 需要处理'}</div>
            <div><strong>图片生成 Provider:</strong> {props.runtimeCheck.imageGeneration.provider}</div>
            <div><strong>图片生成 Model:</strong> {props.runtimeCheck.imageGeneration.model}</div>
            <div><strong>Gemini API Key:</strong> {props.runtimeCheck.imageGeneration.hasGeminiApiKey ? '✅ 已检测到' : '⚠️ 未检测到'}</div>
            <div><strong>Gemini Image Model:</strong> {props.runtimeCheck.imageGeneration.hasGeminiImageModel ? '✅ 已配置' : '⚠️ 未配置'}</div>
            <div><strong>允许上传格式:</strong> {getAcceptedImageTypeLabel()}</div>
            <div><strong>单张上传上限:</strong> {formatBytesToMb(props.runtimeCheck.imageGeneration.uploadMaxBytes)}</div>
            <div><strong>图片尺寸上限:</strong> {props.runtimeCheck.imageGeneration.uploadMaxWidth} × {props.runtimeCheck.imageGeneration.uploadMaxHeight}</div>
            <div><strong>像素总量上限:</strong> {(props.runtimeCheck.imageGeneration.uploadMaxPixels / 1_000_000).toFixed(0)}MP</div>
            <div><strong>上传节流:</strong> 每次上传至少间隔 {Math.ceil(props.runtimeCheck.imageGeneration.uploadMinIntervalMs / 1000)} 秒</div>
          </div>

          <div className="runtime-check-image-tools">
            <div className="runtime-check-card media-storage-card">
              <div className="runtime-check-header">
                <strong>本地图片占用</strong>
                <button
                  type="button"
                  className="runtime-check-button"
                  onClick={onRefreshMediaStorage}
                  disabled={mediaStorageRefreshing || mediaStorageCleaningKidId !== '' || restarting || saving}
                >
                  {mediaStorageRefreshing ? '刷新中…' : '刷新占用统计'}
                </button>
              </div>
              <div className="runtime-check-summary">
                <div><strong>总文件数:</strong> {mediaStorage.totalFileCount}</div>
                <div><strong>总占用:</strong> {formatBytes(mediaStorage.totalBytes)}</div>
                <div><strong>存储目录:</strong> {mediaStorage.rootPath}</div>
              </div>
              <div className="runtime-check-kids">
                {mediaStorage.kids.map((kidStat) => (
                  <div key={kidStat.kidId} className="runtime-kid-card">
                    <strong>{props.kids.find((kid) => kid.id === kidStat.kidId)?.name || kidStat.kidId}</strong>
                    <div>图片文件数：{kidStat.fileCount}</div>
                    <div>磁盘占用：{formatBytes(kidStat.totalBytes)}</div>
                    <div>最近更新：{kidStat.latestModifiedAt ? new Date(kidStat.latestModifiedAt).toLocaleString('zh-CN') : '暂无图片'}</div>
                    <button
                      type="button"
                      className="runtime-check-button"
                      onClick={() => onCleanupKidMediaStorage(kidStat.kidId)}
                      disabled={kidStat.fileCount === 0 || mediaStorageCleaningKidId === kidStat.kidId || mediaStorageRefreshing || restarting || saving}
                    >
                      {mediaStorageCleaningKidId === kidStat.kidId ? '清理中…' : '清理该孩子图片缓存'}
                    </button>
                  </div>
                ))}
              </div>
              <div className="env-admin-note">这里只清理本机 `public/chat-media/` 下的图片缓存，不会改动聊天记录 JSON。</div>
            </div>
            <div className="runtime-check-card media-storage-card">
              <div className="runtime-check-header">
                <strong>最近 smoke test 结果</strong>
                <span>{smokeTestEntries.length ? `${smokeTestEntries.length} 条记录` : '暂无记录'}</span>
              </div>
              {smokeTestEntries.length ? (
                <div className="runtime-check-kids">
                  {smokeTestEntries.map((entry) => (
                    <div key={entry.key} className="runtime-kid-card">
                      <strong>{entry.label}</strong>
                      <div>状态：{entry.ok ? '✅ 成功' : '⚠️ 失败'}</div>
                      <div>时间：{formatLocalDateTime(entry.ranAt)}</div>
                      <div>Provider / Model：{entry.provider || '-'} / {entry.model || '-'}</div>
                      <div>返回图片数：{entry.imageCount ?? '-'}</div>
                      <div>耗时：{typeof entry.elapsedMs === 'number' ? `${entry.elapsedMs}ms` : '-'}</div>
                      <div>{entry.message}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="env-admin-note">还没有 smoke test 历史记录。运行一次上面的测试后，这里会显示最近结果。</div>
              )}
            </div>
            <div className="runtime-check-button-row">
              <button
                type="button"
                className="runtime-check-button"
                onClick={onCheckImageRuntime}
                disabled={imageRuntimeChecking || imageSmokeTesting || mediaSmokeTesting || geminiSmokeTesting || restarting || saving}
              >
                {imageRuntimeChecking ? '检查中…' : '检查图片生成运行时'}
              </button>
              <button
                type="button"
                className="runtime-check-button"
                onClick={onRunMediaSmokeTest}
                disabled={mediaSmokeTesting || imageRuntimeChecking || imageSmokeTesting || geminiSmokeTesting || restarting || saving}
              >
                {mediaSmokeTesting ? '测试中…' : '仅测试智媒'}
              </button>
              <button
                type="button"
                className="runtime-check-button"
                onClick={onRunGeminiSmokeTest}
                disabled={geminiSmokeTesting || imageRuntimeChecking || imageSmokeTesting || mediaSmokeTesting || restarting || saving}
              >
                {geminiSmokeTesting ? '测试中…' : '仅测试 Gemini direct'}
              </button>
              <button
                type="button"
                className="runtime-check-button"
                onClick={onRunImageSmokeTest}
                disabled={imageSmokeTesting || imageRuntimeChecking || mediaSmokeTesting || geminiSmokeTesting || restarting || saving}
              >
                {imageSmokeTesting ? '测试中…' : '运行整链 smoke test'}
              </button>
            </div>
            {mediaSmokePreviewUrl ? (
              <div className="runtime-check-card" style={{ marginTop: 12 }}>
                <div className="runtime-check-header">
                  <strong>智媒 smoke test 预览图</strong>
                  <a href={mediaSmokePreviewUrl} target="_blank" rel="noreferrer">打开图片</a>
                </div>
                <Image
                  src={mediaSmokePreviewUrl}
                  alt={mediaSmokePreviewAlt || '智媒 smoke test 预览图'}
                  width={320}
                  height={320}
                  unoptimized
                  sizes="(max-width: 640px) 100vw, 320px"
                  style={{ width: '100%', maxWidth: 320, height: 'auto', borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff' }}
                />
              </div>
            ) : null}
            {geminiSmokePreviewUrl ? (
              <div className="runtime-check-card" style={{ marginTop: 12 }}>
                <div className="runtime-check-header">
                  <strong>Gemini direct smoke test 预览图</strong>
                  <a href={geminiSmokePreviewUrl} target="_blank" rel="noreferrer">打开图片</a>
                </div>
                <Image
                  src={geminiSmokePreviewUrl}
                  alt={geminiSmokePreviewAlt || 'Gemini direct smoke test 预览图'}
                  width={320}
                  height={320}
                  unoptimized
                  sizes="(max-width: 640px) 100vw, 320px"
                  style={{ width: '100%', maxWidth: 320, height: 'auto', borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff' }}
                />
              </div>
            ) : null}
            {props.runtimeCheck.imageGeneration.issues.length ? (
              <ul>
                {props.runtimeCheck.imageGeneration.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : (
              <div className="runtime-check-ok-small">图片生成运行时配置检查通过。</div>
            )}
          </div>

          {props.runtimeCheck.issues.length ? (
            <div className="runtime-check-issues">
              <strong>需要注意：</strong>
              <ul>
                {props.runtimeCheck.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="runtime-check-ok">当前关键配置检查通过。</div>
          )}

          <div className="runtime-check-kids">
            {props.runtimeCheck.kids.map((kidCheck) => (
              <div key={kidCheck.kidId} className="runtime-kid-card">
                <strong>{kidCheck.kidName}</strong>
                <div>agentId: {kidCheck.agentId || '未配置'}</div>
                <div>profile: {kidCheck.profileExists ? '✅' : '⚠️'} {kidCheck.profilePath || '未解析'}</div>
                <div>workspace: {kidCheck.workspaceExists ? '✅' : '⚠️'} {kidCheck.workspaceDir || '未解析'}</div>
                <div>memory: {kidCheck.memoryExists ? '✅' : '⚠️'} {kidCheck.memoryPath || '未解析'}</div>
                <button
                  type="button"
                  className="runtime-check-button"
                  onClick={() => onCheckAgent(kidCheck.kidId)}
                  disabled={agentCheckingKidId === kidCheck.kidId || restarting || saving}
                >
                  {agentCheckingKidId === kidCheck.kidId ? '测试中…' : '测试 agent 连通性'}
                </button>
                {kidCheck.issues.length ? (
                  <ul>
                    {kidCheck.issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="runtime-check-ok-small">该孩子的关键路径检查通过。</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="memory-admin-shell">
        <aside className="memory-admin-sidebar">
          {props.kids.map((kid) => (
            <button
              key={kid.id}
              className={activeKid === kid.id ? 'memory-kid active' : 'memory-kid'}
              onClick={() => setActiveKid(kid.id)}
            >
              {kid.emoji || '💬'} {kid.name}
            </button>
          ))}

          <div className="admin-tab-group">
            <button className={activeTab === 'memory' ? 'admin-tab active' : 'admin-tab'} onClick={() => setActiveTab('memory')}>
              智能体记忆
            </button>
            <button className={activeTab === 'profile' ? 'admin-tab active' : 'admin-tab'} onClick={() => setActiveTab('profile')}>
              家长资料
            </button>
            <button className={activeTab === 'text' ? 'admin-tab active' : 'admin-tab'} onClick={() => setActiveTab('text')}>
              标题与欢迎语
            </button>
            <button className={activeTab === 'tts' ? 'admin-tab active' : 'admin-tab'} onClick={() => setActiveTab('tts')}>
              TTS 语音
            </button>
            <button className={activeTab === 'history' ? 'admin-tab active' : 'admin-tab'} onClick={() => setActiveTab('history')}>
              聊天记录
            </button>
            <button className={activeTab === 'env' ? 'admin-tab active' : 'admin-tab'} onClick={() => setActiveTab('env')}>
              PIN 设置
            </button>
          </div>
        </aside>

        <section className="memory-admin-main">
          <div className="memory-admin-topbar">
            <strong>
              {activeTab === 'env'
                ? '环境变量 · .env.local'
                : activeTab === 'text'
                  ? `${activeKidData?.name || '未知孩子'} · 标题与欢迎语`
                  : activeTab === 'tts'
                    ? `${activeKidData?.name || '未知孩子'} · TTS 语音设置`
                    : activeTab === 'history'
                      ? `${activeKidData?.name || '未知孩子'} · 聊天记录`
                      : `${activeKidData?.name || '未知孩子'} · ${activeTab === 'memory' ? 'MEMORY.md' : 'profile.json'}`}
            </strong>
            <div className="memory-admin-actions">
              {activeTab === 'profile' ? (
                <>
                  <div className="editor-mode-switch">
                    <button
                      type="button"
                      className={profileEditorMode === 'json' ? 'admin-secondary-button active' : 'admin-secondary-button'}
                      onClick={() => setProfileEditorMode('json')}
                    >
                      Raw JSON
                    </button>
                    <button
                      type="button"
                      className={profileEditorMode === 'form' ? 'admin-secondary-button active' : 'admin-secondary-button'}
                      onClick={() => setProfileEditorMode('form')}
                    >
                      表单模式
                    </button>
                  </div>
                  {profileEditorMode === 'json' ? (
                    <label className="profile-advanced-toggle">
                      <input
                        type="checkbox"
                        checked={allowUnknownProfileFields}
                        onChange={(event) => setAllowUnknownProfileFields(event.target.checked)}
                      />
                      <span>允许扩展字段（高级）</span>
                    </label>
                  ) : null}
                </>
              ) : null}
              {activeTab === 'env' ? (
                <button className="admin-secondary-button" onClick={onRestartService} disabled={restarting || saving}>
                  {restarting ? '重启中…' : '重启服务'}
                </button>
              ) : null}
              {activeTab !== 'history' ? (
                <button onClick={onSave} disabled={saving || restarting || ((activeTab === 'memory' || activeTab === 'profile' || activeTab === 'text' || activeTab === 'tts') && !activeKidData)}>
                  {saving ? '保存中…' : '保存'}
                </button>
              ) : null}
            </div>
          </div>

          {activeTab === 'env' ? (
            <div className="env-admin-form">
              <div className="env-admin-alert">
                <strong>重要：</strong>
                <span>保存只会写入 <code>.env.local</code>。必须再点击“重启服务”，新的 PIN 才会真正生效。</span>
              </div>
              <p className="env-admin-note">在这里可以直接修改所有 PIN、运行模式，以及聊天正式链路使用的图片后端。</p>

              {props.kids.map((kid) => (
                <label key={kid.id} className="env-field">
                  <span>{kid.name} PIN</span>
                  <input
                    type="password"
                    inputMode="numeric"
                    value={envValues.kidPins[kid.id] || ''}
                    onChange={(event) => setKidPin(kid.id, event.target.value)}
                    placeholder={`设置 ${kid.name} 的 PIN`}
                  />
                </label>
              ))}

              <label className="env-field">
                <span>家长 PIN</span>
                <input
                  type="password"
                  inputMode="numeric"
                  value={envValues.adminPin}
                  onChange={(event) => setEnvValues((prev) => ({ ...prev, adminPin: event.target.value.replace(/\D/g, '').slice(0, 12) }))}
                  placeholder="设置家长 PIN"
                />
              </label>

              <label className="env-field">
                <span>OPENCLAW_USE_MOCK</span>
                <select
                  value={envValues.useMock}
                  onChange={(event) => setEnvValues((prev) => ({ ...prev, useMock: event.target.value }))}
                >
                  <option value="false">false（真实模式）</option>
                  <option value="true">true（模拟模式）</option>
                </select>
              </label>

              <label className="env-field">
                <span>PM2 服务名</span>
                <input
                  type="text"
                  value={envValues.pm2Name}
                  onChange={(event) => setEnvValues((prev) => ({ ...prev, pm2Name: event.target.value }))}
                  placeholder="例如 kid-chat-mvp"
                />
              </label>

              <div className="env-fieldset">
                <div className="env-fieldset-title">聊天图片后端</div>
                <div className="env-admin-note">这里控制孩子聊天里正式使用哪条图片生成链路；保存后需要点击“重启服务”才会生效。</div>
                <label className="env-field">
                  <span>KID_CHAT_IMAGE_PROVIDER</span>
                  <select
                    value={envValues.imageProvider}
                    onChange={(event) => setEnvValues((prev) => ({ ...prev, imageProvider: event.target.value as EnvValues['imageProvider'] }))}
                  >
                    <option value="media-agent">media-agent（智媒）</option>
                    <option value="gemini-direct">gemini-direct（Google API 直连）</option>
                    <option value="inference-sh">inference-sh</option>
                  </select>
                </label>
                <label className="env-field">
                  <span>KID_CHAT_IMAGE_MODEL</span>
                  <input
                    type="text"
                    value={envValues.imageModel}
                    onChange={(event) => setEnvValues((prev) => ({ ...prev, imageModel: event.target.value }))}
                    placeholder={envValues.imageProvider === 'gemini-direct' ? '例如 gemini-3.1-flash-image-preview' : envValues.imageProvider === 'inference-sh' ? '例如 gemini-3.1-flash-image-preview' : 'media-agent 模式可留空或作运行时参考'}
                  />
                </label>
                <div className="env-admin-note">当前已选：<strong>{envValues.imageProvider}</strong>{envValues.imageModel ? ` / ${envValues.imageModel}` : ''}</div>
              </div>
            </div>
          ) : activeTab === 'text' ? (
            <div className="env-admin-form">
              <p className="env-admin-note">在这里可以修改首页卡片和聊天页会用到的孩子基础信息。</p>

              {activeKidSettings ? (
                <div className="env-fieldset">
                  <div className="env-fieldset-title">图片 / 语音能力总览</div>
                  <div className="runtime-check-summary">
                    <div><strong>孩子权限:</strong> {getCapabilitySummary(activeKidSettings).join(' · ')}</div>
                    <div><strong>图片后端状态:</strong> {imageRuntimeHealthy ? '✅ 当前运行正常' : '⚠️ 运行配置待处理'}</div>
                    <div><strong>当前图片 Provider:</strong> {props.runtimeCheck.imageGeneration.provider}</div>
                    <div><strong>允许上传格式:</strong> {getAcceptedImageTypeLabel()}</div>
                    <div><strong>单张上传上限:</strong> {formatBytesToMb(props.runtimeCheck.imageGeneration.uploadMaxBytes)}</div>
                    <div><strong>图片尺寸上限:</strong> {props.runtimeCheck.imageGeneration.uploadMaxWidth} × {props.runtimeCheck.imageGeneration.uploadMaxHeight} · {(props.runtimeCheck.imageGeneration.uploadMaxPixels / 1_000_000).toFixed(0)}MP</div>
                    <div><strong>上传节流:</strong> 每次上传至少间隔 {Math.ceil(props.runtimeCheck.imageGeneration.uploadMinIntervalMs / 1000)} 秒</div>
                  </div>
                  <div className="env-admin-note">这里的“孩子权限”决定按钮是否出现在孩子聊天页；上面的“图片后端状态”决定这些能力当前是否真的能跑通。</div>
                </div>
              ) : null}

              {activeKidSettings ? (
                <div className="env-fieldset">
                  <div className="env-fieldset-title">孩子侧能力预览</div>
                  <div className="runtime-check-summary">
                    <div><strong>会显示的模式按钮:</strong> 普通聊天{activeKidSettings.imageUnderstandingEnabled !== false ? ' · 看图解释' : ''}{activeKidSettings.imageGenerationEnabled !== false ? ' · 生成图片' : ''}{activeKidSettings.imageEditEnabled === true ? ' · 参考图改图' : ''}</div>
                    <div><strong>会显示上传图片按钮:</strong> {activeKidSettings.imageUnderstandingEnabled !== false ? '会显示' : '不会显示'}</div>
                    <div><strong>会显示朗读按钮:</strong> {activeKidSettings.ttsEnabled !== false ? '会显示（仅 assistant 回复旁）' : '不会显示'}</div>
                    <div><strong>当前缓存占用:</strong> {activeKidMediaStorage ? `${activeKidMediaStorage.fileCount} 个文件 · ${formatBytes(activeKidMediaStorage.totalBytes)}` : '暂无统计'}</div>
                  </div>
                  <div className="env-admin-note">这块是站在孩子视角看的：家长改完开关后，孩子聊天页实际会看到什么，尽量一眼看明白。</div>
                </div>
              ) : null}

              <label className="env-field">
                <span>{activeKidData?.name || '当前孩子'} 名字</span>
                <input
                  type="text"
                  value={textSettings[activeKid]?.name || ''}
                  onChange={(event) => setKidText(activeKid, 'name', event.target.value)}
                  placeholder="设置显示名字"
                />
              </label>

              <label className="env-field">
                <span>{activeKidData?.name || '当前孩子'} Emoji</span>
                <input
                  type="text"
                  value={textSettings[activeKid]?.emoji || ''}
                  onChange={(event) => setKidText(activeKid, 'emoji', event.target.value)}
                  placeholder="例如 🌸 或 🚀"
                />
                <div className="emoji-picker-grid">
                  {COMMON_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className={textSettings[activeKid]?.emoji === emoji ? 'emoji-option active' : 'emoji-option'}
                      onClick={() => setKidText(activeKid, 'emoji', emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </label>

              <label className="env-field">
                <span>{activeKidData?.name || '当前孩子'} 主题颜色</span>
                <div className="color-picker-row">
                  <input
                    type="color"
                    value={textSettings[activeKid]?.accentColor || '#000000'}
                    onChange={(event) => setKidText(activeKid, 'accentColor', event.target.value)}
                    className="color-picker-input"
                  />
                  <input
                    type="text"
                    value={textSettings[activeKid]?.accentColor || ''}
                    onChange={(event) => setKidText(activeKid, 'accentColor', event.target.value)}
                    placeholder="例如 #ec4899"
                  />
                </div>
              </label>

              <label className="env-field">
                <span>{activeKidData?.name || '当前孩子'} 标题</span>
                <input
                  type="text"
                  value={textSettings[activeKid]?.title || ''}
                  onChange={(event) => setKidText(activeKid, 'title', event.target.value)}
                  placeholder="设置首页和聊天页显示的标题"
                />
              </label>

              <label className="env-field">
                <span>{activeKidData?.name || '当前孩子'} 欢迎语</span>
                <textarea
                  className="admin-textarea"
                  value={textSettings[activeKid]?.welcome || ''}
                  onChange={(event) => setKidText(activeKid, 'welcome', event.target.value)}
                  placeholder="设置进入聊天时显示的欢迎语"
                />
              </label>

              <div className="env-fieldset">
                <div className="env-fieldset-title">图片能力控制</div>
                <div className="env-admin-note">建议把“是否允许孩子使用图片功能”和“系统图片后端是否正常”分开看：前者在这里控制，后者看页面顶部运行环境自检。</div>
                <label className="env-checkbox-row">
                  <input
                    type="checkbox"
                    checked={textSettings[activeKid]?.imageGenerationEnabled !== false}
                    onChange={(event) => setKidCapability(activeKid, 'imageGenerationEnabled', event.target.checked)}
                  />
                  <span>允许生成图片</span>
                </label>
                <label className="env-checkbox-row">
                  <input
                    type="checkbox"
                    checked={textSettings[activeKid]?.imageUnderstandingEnabled !== false}
                    onChange={(event) => setKidCapability(activeKid, 'imageUnderstandingEnabled', event.target.checked)}
                  />
                  <span>允许解释图片</span>
                </label>
                <label className="env-checkbox-row">
                  <input
                    type="checkbox"
                    checked={textSettings[activeKid]?.imageEditEnabled === true}
                    onChange={(event) => setKidCapability(activeKid, 'imageEditEnabled', event.target.checked)}
                  />
                  <span>允许参考图改图（预留）</span>
                </label>
              </div>
            </div>
          ) : activeTab === 'tts' ? (
            <div className="env-admin-form">
              <p className="env-admin-note">管理孩子端手动朗读回复时使用的 TTS 设置。当前版本仅影响手动点击朗读按钮，不会自动朗读最新消息。</p>
              <p className="env-admin-note">Voice 列表会尽量标出推荐项、语言匹配项、本机 voice 和系统默认 voice，帮助家长更快找到合适的声音。</p>

              <label className="env-field">
                <span>TTS 开关</span>
                <select
                  value={textSettings[activeKid]?.ttsEnabled ? 'true' : 'false'}
                  onChange={(event) => setKidTts(activeKid, 'ttsEnabled', event.target.value === 'true')}
                >
                  <option value="true">开启</option>
                  <option value="false">关闭</option>
                </select>
              </label>

              <label className="env-field">
                <span>偏好 Voice</span>
                <select
                  value={textSettings[activeKid]?.ttsPreferredVoiceName || ''}
                  onChange={(event) => setKidText(activeKid, 'ttsPreferredVoiceName', event.target.value)}
                >
                  <option value="">自动选择（推荐）</option>
                  {availableVoices.map((voice) => (
                    <option key={voice.value} value={voice.value}>
                      {voice.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="env-field">
                <span>语速</span>
                <input
                  type="range"
                  min="0.6"
                  max="1.2"
                  step="0.05"
                  value={textSettings[activeKid]?.ttsRate ?? 0.9}
                  onChange={(event) => setKidTts(activeKid, 'ttsRate', Number(event.target.value))}
                />
                <div className="env-admin-note">当前语速：{(textSettings[activeKid]?.ttsRate ?? 0.9).toFixed(2)}</div>
              </label>

              <div className="tts-preview-row">
                <button
                  type="button"
                  className="admin-secondary-button"
                  onClick={() => onPreviewTts(activeKid)}
                  disabled={ttsPreviewingKidId !== '' && ttsPreviewingKidId !== activeKid}
                >
                  {ttsPreviewingKidId === activeKid ? '停止试听' : '试听当前语音'}
                </button>
              </div>
            </div>
          ) : activeTab === 'history' ? (
            <div className="admin-history-layout">
              <aside className="admin-history-sidebar">
                <div className="admin-history-filters">
                  <label className="env-field admin-history-search">
                    <span>搜索聊天记录</span>
                    <input
                      type="text"
                      value={historyQuery}
                      onChange={(event) =>
                        activeKidData &&
                        setHistoryQueryByKid((prev) => ({
                          ...prev,
                          [activeKidData.id]: event.target.value,
                        }))
                      }
                      placeholder="按标题、摘要或消息内容搜索"
                    />
                  </label>

                  <label className="env-field admin-history-range">
                    <span>时间范围</span>
                    <select
                      value={historyRange}
                      onChange={(event) =>
                        activeKidData &&
                        setHistoryRangeByKid((prev) => ({
                          ...prev,
                          [activeKidData.id]: event.target.value as HistoryRange,
                        }))
                      }
                    >
                      <option value="all">全部</option>
                      <option value="7d">最近 7 天</option>
                      <option value="today">今天</option>
                    </select>
                  </label>
                </div>

                <div className="admin-history-list">
                {filteredChats.length ? (
                  filteredChats.map((chat) => (
                    <button
                      key={chat.id}
                      type="button"
                      className={activeChatId === chat.id ? 'admin-history-item active' : 'admin-history-item'}
                      onClick={() =>
                        setSelectedChatIdByKid((prev) => ({
                          ...prev,
                          [activeKidData.id]: chat.id,
                        }))
                      }
                    >
                      <strong>{renderHighlightedText(chat.title, historyQuery)}</strong>
                      <span>{renderHighlightedText(chat.preview, historyQuery)}</span>
                      <small>{chat.updatedAt}</small>
                    </button>
                  ))
                ) : (
                  <div className="empty-state">{historyQuery || historyRange !== 'all' ? '没有匹配的聊天记录。' : '这个孩子还没有聊天记录。'}</div>
                )}
                </div>
              </aside>

              <section className="admin-history-viewer">
                {activeChatId ? (
                  activeChatMessages.length ? (
                    activeChatMessages.map((message) => (
                      <article key={message.id} className={message.role === 'user' ? 'admin-history-message user' : 'admin-history-message assistant'}>
                        <div className="admin-history-meta">
                          <strong>{message.role === 'user' ? '孩子' : '助手'}</strong>
                          <time>{message.createdAt}</time>
                        </div>
                        <div>{renderHighlightedText(message.content, historyQuery)}</div>
                      </article>
                    ))
                  ) : (
                    <div className="empty-state">这个会话目前没有消息。</div>
                  )
                ) : (
                  <div className="empty-state">请选择一个会话查看内容。</div>
                )}
              </section>
            </div>
          ) : activeTab === 'profile' && profileEditorMode === 'form' ? (
            <div className="env-admin-form">
              <p className="env-admin-note">表单模式适合快速维护常用字段；你也可以随时切回 Raw JSON。当前支持字段：name、ageGroup、languages、likes、learningGoals、tone、responseStyle、avoid、notes。</p>

              <label className="env-field">
                <span>名字</span>
                <input type="text" value={profileForm.name} onChange={(event) => setProfileFormField('name', event.target.value)} />
              </label>

              <label className="env-field">
                <span>年龄段</span>
                <input type="text" value={profileForm.ageGroup} onChange={(event) => setProfileFormField('ageGroup', event.target.value)} placeholder="例如 early-elementary" />
              </label>

              <label className="env-field">
                <span>语言（每行一项）</span>
                <textarea className="admin-textarea" value={profileForm.languages} onChange={(event) => setProfileFormField('languages', event.target.value)} />
              </label>

              <label className="env-field">
                <span>喜欢的内容（每行一项）</span>
                <textarea className="admin-textarea" value={profileForm.likes} onChange={(event) => setProfileFormField('likes', event.target.value)} />
              </label>

              <label className="env-field">
                <span>学习目标（每行一项）</span>
                <textarea className="admin-textarea" value={profileForm.learningGoals} onChange={(event) => setProfileFormField('learningGoals', event.target.value)} />
              </label>

              <label className="env-field">
                <span>偏好语气</span>
                <input type="text" value={profileForm.tone} onChange={(event) => setProfileFormField('tone', event.target.value)} />
              </label>

              <label className="env-field">
                <span>回复风格（每行一项）</span>
                <textarea className="admin-textarea" value={profileForm.responseStyle} onChange={(event) => setProfileFormField('responseStyle', event.target.value)} />
              </label>

              <label className="env-field">
                <span>避免内容（每行一项）</span>
                <textarea className="admin-textarea" value={profileForm.avoid} onChange={(event) => setProfileFormField('avoid', event.target.value)} />
              </label>

              <label className="env-field">
                <span>备注（每行一项）</span>
                <textarea className="admin-textarea" value={profileForm.notes} onChange={(event) => setProfileFormField('notes', event.target.value)} />
              </label>
            </div>
          ) : activeTab === 'profile' && profileEditorMode === 'json' ? (
            <div className="profile-json-mode">
              <p className="env-admin-note">
                Raw JSON 默认按严格 schema 校验。勾选“允许扩展字段（高级）”后，可以保留额外字段，但标准字段仍会被规范化。
              </p>
              {unknownProfileKeys.length ? (
                <div className={allowUnknownProfileFields ? 'profile-extra-fields profile-extra-fields-allowed' : 'profile-extra-fields'}>
                  <strong>检测到扩展字段：</strong>
                  <div className="profile-extra-field-list">
                    {unknownProfileKeys.map((key) => (
                      <code key={key}>{key}</code>
                    ))}
                  </div>
                  <span>
                    {allowUnknownProfileFields
                      ? '当前已允许这些扩展字段被保留。'
                      : '当前保存会被严格 schema 拦截；如需保留，请开启“允许扩展字段（高级）”。'}
                  </span>
                </div>
              ) : null}
              <textarea className="memory-editor" value={currentValue} onChange={(event) => setCurrentValue(event.target.value)} />
            </div>
          ) : (
            <textarea className="memory-editor" value={currentValue} onChange={(event) => setCurrentValue(event.target.value)} />
          )}

          {status ? <div className="memory-status">{status}</div> : null}
        </section>
      </section>
    </main>
  );
}
