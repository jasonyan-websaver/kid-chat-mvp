'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { formatBytesToMb, getAcceptedImageTypeLabel } from '@/lib/image-upload-policy';

type TabKey = 'memory' | 'env' | 'text' | 'history' | 'tasks';

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
  chats: AdminChatSummary[];
  messagesByChat: Record<string, AdminChatMessage[]>;
};

type RuntimeKidCheck = {
  kidId: string;
  kidName: string;
  agentId: string;
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

type AdminTaskRecord = {
  id?: string;
  type?: string;
  status?: string;
  topic?: string;
  topicLabel?: string;
  targetWordCount?: number;
  rewardType?: string;
  rewardTheme?: string;
  instructions?: string;
  createdBy?: string;
  createdAt?: string;
} & Record<string, unknown>;

type AdminTaskStatus = {
  kidId: string;
  inbox: AdminTaskRecord[];
  claimed: AdminTaskRecord[];
  completed: AdminTaskRecord[];
  archived: AdminTaskRecord[];
  activeTask: AdminTaskRecord | null;
  latestCompletedTask: AdminTaskRecord | null;
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
  rewardSettings: {
    enabled: boolean;
    defaultType: string;
    certificateTitle: string;
    imageThemes: string[];
    encouragementStyle: string;
  };
}>;

type ProfileFormState = {
  name: string;
  languageMode: string;
  replyLength: string;
  safetyMode: string;
  memoryWrite: string;
  bilingualAssistEnabled: boolean;
  storyModeEnabled: boolean;
  homeworkHelpEnabled: boolean;
  parentNotes: string;
};

type HistoryRange = 'all' | '7d' | 'today';

type NewTaskFormState = {
  topic: string;
  topicLabel: string;
  targetWordCount: string;
  rewardType: 'image' | 'certificate' | 'message';
  rewardTheme: string;
  createdBy: string;
  instructions: string;
};

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

function formatRewardTypeLabel(value: string) {
  if (value === 'image') return '图片奖励';
  if (value === 'certificate') return '奖状';
  if (value === 'message') return '文字鼓励';
  return value || '未设置';
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

function getTaskStatusLabel(status?: string) {
  if (status === 'pending') return '待领取';
  if (status === 'claimed') return '进行中';
  if (status === 'completed') return '已完成';
  if (status === 'archived') return '已归档';
  return status || '未知状态';
}

function getTaskTypeLabel(type?: string) {
  if (type === 'french-writing') return '法语写作';
  return type || '未分类';
}

function getTaskTitle(task: AdminTaskRecord | null | undefined) {
  if (!task) return '暂无任务';
  return task.topicLabel || task.topic || task.id || '未命名任务';
}

function getTaskStateKey(task: AdminTaskRecord | null | undefined) {
  if (!task?.status) return '';
  if (task.status === 'pending') return 'pending';
  if (task.status === 'claimed') return 'claimed';
  if (task.status === 'completed') return 'completed';
  if (task.status === 'archived') return 'archived';
  return '';
}

function getTaskStateColumnLabel(state: string) {
  if (state === 'pending') return '待领取';
  if (state === 'claimed') return '进行中';
  if (state === 'completed') return '已完成';
  if (state === 'archived') return '已归档';
  return '未知';
}

function defaultNewTaskForm(): NewTaskFormState {
  return {
    topic: 'rocket',
    topicLabel: 'la fusée',
    targetWordCount: '20',
    rewardType: 'image',
    rewardTheme: 'rocket',
    createdBy: 'parent-admin',
    instructions: 'Écris un petit texte en français sur le thème « la fusée », avec environ 20 mots.',
  };
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
    languageMode: '',
    replyLength: '',
    safetyMode: '',
    memoryWrite: '',
    bilingualAssistEnabled: false,
    storyModeEnabled: false,
    homeworkHelpEnabled: false,
    parentNotes: '',
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
      languageMode: typeof parsed.languageMode === 'string' ? parsed.languageMode : '',
      replyLength: typeof parsed.replyLength === 'string' ? parsed.replyLength : '',
      safetyMode: typeof parsed.safetyMode === 'string' ? parsed.safetyMode : '',
      memoryWrite: typeof parsed.memoryWrite === 'string' ? parsed.memoryWrite : '',
      bilingualAssistEnabled: parsed.bilingualAssistEnabled === true,
      storyModeEnabled: parsed.storyModeEnabled === true,
      homeworkHelpEnabled: parsed.homeworkHelpEnabled === true,
      parentNotes: asLines(parsed.parentNotes),
    };
  } catch {
    return emptyProfileForm();
  }
}

function profileFormToJson(form: ProfileFormState) {
  const payload = {
    name: form.name.trim(),
    languageMode: form.languageMode.trim(),
    replyLength: form.replyLength.trim(),
    safetyMode: form.safetyMode.trim(),
    memoryWrite: form.memoryWrite.trim(),
    bilingualAssistEnabled: form.bilingualAssistEnabled,
    storyModeEnabled: form.storyModeEnabled,
    homeworkHelpEnabled: form.homeworkHelpEnabled,
    parentNotes: toLineList(form.parentNotes),
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

export function AdminPanel(props: { kids: AdminKid[]; envValues: EnvValues; textSettings: TextSettings; runtimeCheck: RuntimeCheck; mediaStorage: MediaStorageSummary; smokeTests: SmokeTestLog; taskStatuses?: AdminTaskStatus[] }) {
  const [activeKid, setActiveKid] = useState(props.kids[0]?.id || '');
  const [activeTab, setActiveTab] = useState<TabKey>('memory');
  const [saving, setSaving] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [agentCheckingKidId, setAgentCheckingKidId] = useState('');
  const [resetTestingKidId, setResetTestingKidId] = useState('');
  const [imageRuntimeChecking, setImageRuntimeChecking] = useState(false);
  const [imageSmokeTesting, setImageSmokeTesting] = useState(false);
  const [mediaSmokeTesting, setMediaSmokeTesting] = useState(false);
  const [geminiSmokeTesting, setGeminiSmokeTesting] = useState(false);
  const [mediaStorageRefreshing, setMediaStorageRefreshing] = useState(false);
  const [mediaStorageCleaningKidId, setMediaStorageCleaningKidId] = useState('');
  const [ttsPreviewingKidId, setTtsPreviewingKidId] = useState('');
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
  const [status, setStatus] = useState('');
  const [mediaSmokePreviewUrl, setMediaSmokePreviewUrl] = useState('');
  const [mediaSmokePreviewAlt, setMediaSmokePreviewAlt] = useState('');
  const [geminiSmokePreviewUrl, setGeminiSmokePreviewUrl] = useState('');
  const [geminiSmokePreviewAlt, setGeminiSmokePreviewAlt] = useState('');
  const [kidContent, setKidContent] = useState<Record<string, { memory: string }>>(
    () =>
      Object.fromEntries(
        props.kids.map((kid) => [kid.id, { memory: kid.memory }]),
      ),
  );
  const [envValues, setEnvValues] = useState<EnvValues>(props.envValues);
  const [textSettings, setTextSettings] = useState<TextSettings>(props.textSettings);
  const [mediaStorage, setMediaStorage] = useState<MediaStorageSummary>(props.mediaStorage);
  const [taskStatuses, setTaskStatuses] = useState<AdminTaskStatus[]>(props.taskStatuses || []);
  const [taskStatusRefreshing, setTaskStatusRefreshing] = useState(false);
  const [taskManagingKidId, setTaskManagingKidId] = useState('');
  const [selectedTaskIdByKid, setSelectedTaskIdByKid] = useState<Record<string, string>>({});
  const [taskJsonCopying, setTaskJsonCopying] = useState(false);
  const [selectedTaskAction, setSelectedTaskAction] = useState('');
  const [creatingTask, setCreatingTask] = useState(false);
  const [newTaskFormByKid, setNewTaskFormByKid] = useState<Record<string, NewTaskFormState>>(() =>
    Object.fromEntries(props.kids.map((kid) => [kid.id, defaultNewTaskForm()])),
  );

  const activeKidData = useMemo(() => props.kids.find((kid) => kid.id === activeKid) ?? props.kids[0] ?? null, [props.kids, activeKid]);

  const currentValue = useMemo(() => {
    if (!activeKidData || activeTab === 'env' || activeTab === 'text') return '';
    const current = kidContent[activeKidData.id];
    return current?.memory || '';
  }, [activeKidData, activeTab, kidContent]);

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
  const activeTaskStatus = activeKidData ? taskStatuses.find((item) => item.kidId === activeKidData.id) || null : null;
  const activeTaskList = useMemo(() => activeTaskStatus
    ? [...activeTaskStatus.claimed, ...activeTaskStatus.inbox, ...activeTaskStatus.completed, ...activeTaskStatus.archived]
    : [] as AdminTaskRecord[], [activeTaskStatus]);
  const selectedTaskId = activeKidData ? selectedTaskIdByKid[activeKidData.id] || '' : '';
  const selectedTask = useMemo(() => {
    if (!activeTaskList.length) return null;
    return activeTaskList.find((task) => String(task.id || '') === selectedTaskId) || activeTaskList[0] || null;
  }, [activeTaskList, selectedTaskId]);
  const selectedTaskState = getTaskStateKey(selectedTask);
  const activeNewTaskForm = activeKidData ? newTaskFormByKid[activeKidData.id] || defaultNewTaskForm() : defaultNewTaskForm();

  useEffect(() => {
    if (!activeKidData) return;
    if (!activeTaskList.length) return;

    const hasSelectedTask = activeTaskList.some((task) => String(task.id || '') === (selectedTaskIdByKid[activeKidData.id] || ''));
    if (!hasSelectedTask) {
      setSelectedTaskIdByKid((prev) => ({
        ...prev,
        [activeKidData.id]: String(activeTaskList[0]?.id || ''),
      }));
    }
  }, [activeKidData, activeTaskList, selectedTaskIdByKid]);

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
        memory: value,
      },
    }));
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

  function setKidRewardField(kidId: string, field: 'enabled' | 'defaultType' | 'certificateTitle' | 'imageThemes' | 'encouragementStyle', value: boolean | string | string[]) {
    setTextSettings((prev) => ({
      ...prev,
      [kidId]: {
        ...prev[kidId],
        rewardSettings: {
          ...prev[kidId].rewardSettings,
          [field]: value,
        },
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

  async function onManageKidTasks(kidId: string, action: 'archive-current' | 'clear-all') {
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(action === 'archive-current'
        ? `确定要归档 ${kidId} 的当前任务吗？`
        : `确定要清空 ${kidId} 的全部任务吗？这会把 inbox/claimed/completed 都移到 archived。`);
      if (!confirmed) return;
    }

    setTaskManagingKidId(`${kidId}:${action}`);
    setStatus('');

    try {
      const response = await fetch('/api/admin-task-manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kidId, action }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || '任务管理操作失败');
      }
      setStatus(data.message || '任务管理操作已完成。');
      await onRefreshTaskStatuses();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '任务管理操作失败');
    } finally {
      setTaskManagingKidId('');
    }
  }

  async function onRefreshTaskStatuses() {
    setTaskStatusRefreshing(true);
    setStatus('');

    try {
      const response = await fetch('/api/admin-task-status');
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || '刷新任务状态失败');
      }
      setTaskStatuses(Array.isArray(data.kids) ? data.kids : []);
      setStatus('任务状态已刷新。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '刷新任务状态失败');
    } finally {
      setTaskStatusRefreshing(false);
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

      if (activeTab === 'text') {
        const response = await fetch('/api/kid-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(textSettings),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || '保存失败');
        }

        setStatus(data.message || '孩子设置已保存。');
        return;
      }

      if (!activeKidData) {
        throw new Error('未知孩子');
      }

      const endpoint = '/api/memory';
      const payload = { kidId: activeKidData.id, content: currentValue };
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

  async function onResetKidTestData(kidId: string) {
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(`确定要清空 ${kidId} 的聊天/任务历史，并重建一个新的测试任务吗？`);
      if (!confirmed) return;
    }

    setResetTestingKidId(kidId);
    setStatus('');

    try {
      const response = await fetch('/api/admin-reset-kid-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kidId }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || '重置测试数据失败');
      }

      setStatus(data.message || `已重置 ${kidId} 的测试数据。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '重置测试数据失败');
    } finally {
      setResetTestingKidId('');
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

  function setNewTaskField(field: keyof NewTaskFormState, value: string) {
    if (!activeKidData) return;
    setNewTaskFormByKid((prev) => ({
      ...prev,
      [activeKidData.id]: {
        ...(prev[activeKidData.id] || defaultNewTaskForm()),
        [field]: value,
      },
    }));
  }

  async function onCreateTask() {
    if (!activeKidData) {
      setStatus('未知孩子');
      return;
    }

    setCreatingTask(true);
    setStatus('');
    try {
      const response = await fetch('/api/admin-task-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kidId: activeKidData.id,
          topic: activeNewTaskForm.topic,
          topicLabel: activeNewTaskForm.topicLabel,
          targetWordCount: Number(activeNewTaskForm.targetWordCount || 20),
          rewardType: activeNewTaskForm.rewardType,
          rewardTheme: activeNewTaskForm.rewardTheme,
          createdBy: activeNewTaskForm.createdBy,
          instructions: activeNewTaskForm.instructions,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || '创建任务失败');
      }
      const createdTask = data.task as AdminTaskRecord | undefined;
      setStatus(data.message || '新任务已创建。');
      if (createdTask) {
        setTaskStatuses((prev) => prev.map((item) => item.kidId === activeKidData.id
          ? {
              ...item,
              inbox: [createdTask, ...item.inbox],
              activeTask: item.claimed[0] || createdTask || item.inbox[0] || null,
            }
          : item));
        setSelectedTaskIdByKid((prev) => ({
          ...prev,
          [activeKidData.id]: String(createdTask.id || ''),
        }));
      } else {
        await onRefreshTaskStatuses();
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '创建任务失败');
    } finally {
      setCreatingTask(false);
    }
  }

  async function onMoveSelectedTask(to: 'pending' | 'claimed' | 'completed' | 'archived') {
    if (!activeKidData || !selectedTask?.id) {
      setStatus('当前没有可操作的任务。');
      return;
    }

    const from = getTaskStateKey(selectedTask) as 'pending' | 'claimed' | 'completed' | 'archived' | '';
    if (!from) {
      setStatus('无法识别当前任务状态。');
      return;
    }
    if (from === to) {
      setStatus('这条任务已经在目标状态里了。');
      return;
    }

    setSelectedTaskAction(`move:${to}`);
    setStatus('');
    try {
      const response = await fetch('/api/admin-task-manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kidId: activeKidData.id,
          action: 'move-task',
          taskId: String(selectedTask.id),
          from,
          to,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || '移动任务失败');
      }
      setStatus(data.message || '任务状态已更新。');
      setTaskStatuses((prev) => prev.map((item) => {
        if (item.kidId !== activeKidData.id) return item;
        const movedId = String(selectedTask.id);
        const removeTask = (tasks: AdminTaskRecord[]) => tasks.filter((task) => String(task.id || '') !== movedId);
        const movedTask: AdminTaskRecord = { ...selectedTask, status: to };
        const next = {
          ...item,
          inbox: to === 'pending' ? [movedTask, ...removeTask(item.inbox)] : removeTask(item.inbox),
          claimed: to === 'claimed' ? [movedTask, ...removeTask(item.claimed)] : removeTask(item.claimed),
          completed: to === 'completed' ? [movedTask, ...removeTask(item.completed)] : removeTask(item.completed),
          archived: to === 'archived' ? [movedTask, ...removeTask(item.archived)] : removeTask(item.archived),
        };
        return {
          ...next,
          activeTask: next.claimed[0] || next.inbox[0] || null,
          latestCompletedTask: next.completed.length ? next.completed[next.completed.length - 1] : null,
        };
      }));
      setSelectedTaskIdByKid((prev) => ({
        ...prev,
        [activeKidData.id]: String(selectedTask.id),
      }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '移动任务失败');
    } finally {
      setSelectedTaskAction('');
    }
  }

  async function onDeleteSelectedTask() {
    if (!activeKidData || !selectedTask?.id) {
      setStatus('当前没有可删除的任务。');
      return;
    }

    const from = getTaskStateKey(selectedTask) as 'pending' | 'claimed' | 'completed' | 'archived' | '';
    if (!from) {
      setStatus('无法识别当前任务状态。');
      return;
    }

    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(`确定要删除任务 ${getTaskTitle(selectedTask)} 吗？这会直接删除对应 JSON 文件。`);
      if (!confirmed) return;
    }

    setSelectedTaskAction('delete');
    setStatus('');
    try {
      const response = await fetch('/api/admin-task-manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kidId: activeKidData.id,
          action: 'delete-task',
          taskId: String(selectedTask.id),
          from,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || '删除任务失败');
      }
      setStatus(data.message || '任务已删除。');
      setTaskStatuses((prev) => prev.map((item) => {
        if (item.kidId !== activeKidData.id) return item;
        const deletedId = String(selectedTask.id);
        const next = {
          ...item,
          inbox: item.inbox.filter((task) => String(task.id || '') !== deletedId),
          claimed: item.claimed.filter((task) => String(task.id || '') !== deletedId),
          completed: item.completed.filter((task) => String(task.id || '') !== deletedId),
          archived: item.archived.filter((task) => String(task.id || '') !== deletedId),
        };
        return {
          ...next,
          activeTask: next.claimed[0] || next.inbox[0] || null,
          latestCompletedTask: next.completed.length ? next.completed[next.completed.length - 1] : null,
        };
      }));
      const remainingTaskIds = activeTaskList
        .map((task) => String(task.id || ''))
        .filter((taskId) => taskId && taskId !== String(selectedTask.id));
      setSelectedTaskIdByKid((prev) => ({
        ...prev,
        [activeKidData.id]: remainingTaskIds[0] || '',
      }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '删除任务失败');
    } finally {
      setSelectedTaskAction('');
    }
  }

  async function onCopySelectedTaskJson() {
    if (!selectedTask) {
      setStatus('当前没有可复制的任务。');
      return;
    }

    const content = JSON.stringify(selectedTask, null, 2);

    try {
      setTaskJsonCopying(true);
      if (typeof window !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
        setStatus('任务 JSON 已复制到剪贴板。');
        return;
      }

      setStatus('当前浏览器不支持直接复制，请手动复制右侧原始字段。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '复制任务 JSON 失败');
    } finally {
      setTaskJsonCopying(false);
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
                <div>workspace: {kidCheck.workspaceExists ? '✅' : '⚠️'} {kidCheck.workspaceDir || '未解析'}</div>
                <div>memory: {kidCheck.memoryExists ? '✅' : '⚠️'} {kidCheck.memoryPath || '未解析'}</div>
                <div className="runtime-check-button-row">
                  <button
                    type="button"
                    className="runtime-check-button"
                    onClick={() => onCheckAgent(kidCheck.kidId)}
                    disabled={agentCheckingKidId === kidCheck.kidId || restarting || saving || resetTestingKidId === kidCheck.kidId}
                  >
                    {agentCheckingKidId === kidCheck.kidId ? '测试中…' : '测试 agent 连通性'}
                  </button>
                  <button
                    type="button"
                    className="runtime-check-button"
                    onClick={() => onResetKidTestData(kidCheck.kidId)}
                    disabled={resetTestingKidId === kidCheck.kidId || restarting || saving || agentCheckingKidId === kidCheck.kidId}
                  >
                    {resetTestingKidId === kidCheck.kidId ? '重置中…' : `重置${kidCheck.kidName}测试数据`}
                  </button>
                </div>
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
            <button className={activeTab === 'text' ? 'admin-tab active' : 'admin-tab'} onClick={() => setActiveTab('text')}>
              标题与欢迎语
            </button>
            <button className={activeTab === 'history' ? 'admin-tab active' : 'admin-tab'} onClick={() => setActiveTab('history')}>
              聊天记录
            </button>
            <button className={activeTab === 'tasks' ? 'admin-tab active' : 'admin-tab'} onClick={() => setActiveTab('tasks')}>
              任务浏览
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
                  : activeTab === 'history'
                  ? `${activeKidData?.name || '未知孩子'} · 聊天记录`
                  : activeTab === 'tasks'
                    ? `${activeKidData?.name || '未知孩子'} · 任务浏览`
                    : `${activeKidData?.name || '未知孩子'} · MEMORY.md`}
            </strong>
            <div className="memory-admin-actions">
              {activeTab === 'tasks' ? (
                <button className="admin-secondary-button" onClick={onRefreshTaskStatuses} disabled={taskStatusRefreshing || restarting || saving}>
                  {taskStatusRefreshing ? '刷新中…' : '刷新任务状态'}
                </button>
              ) : null}
              {activeTab === 'env' ? (
                <button className="admin-secondary-button" onClick={onRestartService} disabled={restarting || saving}>
                  {restarting ? '重启中…' : '重启服务'}
                </button>
              ) : null}
              {activeTab !== 'history' && activeTab !== 'tasks' ? (
                <button onClick={onSave} disabled={saving || restarting || ((activeTab === 'memory' || activeTab === 'text') && !activeKidData)}>
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
          ) : activeTab === 'tasks' ? (
            <div className="admin-task-browser">
              <div className="admin-task-overview-grid">
                <article className="admin-task-summary-card">
                  <span className="admin-task-summary-label">当前活跃任务</span>
                  <strong>{getTaskTitle(activeTaskStatus?.activeTask)}</strong>
                  <div className="admin-task-summary-meta">
                    <span>{getTaskStatusLabel(activeTaskStatus?.activeTask?.status)}</span>
                    <span>{getTaskTypeLabel(activeTaskStatus?.activeTask?.type)}</span>
                  </div>
                  {activeTaskStatus?.activeTask?.instructions ? (
                    <p>{String(activeTaskStatus.activeTask.instructions)}</p>
                  ) : (
                    <p>当前没有等待领取或进行中的任务。</p>
                  )}
                </article>

                <article className="admin-task-summary-card">
                  <span className="admin-task-summary-label">最近完成</span>
                  <strong>{getTaskTitle(activeTaskStatus?.latestCompletedTask)}</strong>
                  <div className="admin-task-summary-meta">
                    <span>{activeTaskStatus?.latestCompletedTask?.createdAt ? formatLocalDateTime(String(activeTaskStatus.latestCompletedTask.createdAt)) : '暂无记录'}</span>
                    <span>{activeTaskStatus?.latestCompletedTask?.targetWordCount ? `${String(activeTaskStatus.latestCompletedTask.targetWordCount)} 词` : '未设字数'}</span>
                  </div>
                  <p>{activeTaskStatus?.latestCompletedTask?.instructions ? String(activeTaskStatus.latestCompletedTask.instructions) : '完成后的任务会显示在这里，方便家长快速回看。'}</p>
                </article>

                <article className="admin-task-summary-card admin-task-summary-card-actions">
                  <span className="admin-task-summary-label">新建任务</span>
                  <div className="admin-task-create-form">
                    <input
                      type="text"
                      value={activeNewTaskForm.topic}
                      onChange={(event) => setNewTaskField('topic', event.target.value)}
                      placeholder="topic，例如 rocket"
                    />
                    <input
                      type="text"
                      value={activeNewTaskForm.topicLabel}
                      onChange={(event) => setNewTaskField('topicLabel', event.target.value)}
                      placeholder="展示标题，例如 la fusée"
                    />
                    <input
                      type="number"
                      min="1"
                      value={activeNewTaskForm.targetWordCount}
                      onChange={(event) => setNewTaskField('targetWordCount', event.target.value)}
                      placeholder="目标字数"
                    />
                    <select
                      value={activeNewTaskForm.rewardType}
                      onChange={(event) => setNewTaskField('rewardType', event.target.value)}
                    >
                      <option value="image">图片奖励</option>
                      <option value="certificate">奖状</option>
                      <option value="message">文字鼓励</option>
                    </select>
                    <input
                      type="text"
                      value={activeNewTaskForm.rewardTheme}
                      onChange={(event) => setNewTaskField('rewardTheme', event.target.value)}
                      placeholder="reward theme"
                    />
                    <input
                      type="text"
                      value={activeNewTaskForm.createdBy}
                      onChange={(event) => setNewTaskField('createdBy', event.target.value)}
                      placeholder="created by"
                    />
                    <textarea
                      className="admin-textarea admin-task-create-textarea"
                      value={activeNewTaskForm.instructions}
                      onChange={(event) => setNewTaskField('instructions', event.target.value)}
                      placeholder="任务说明"
                    />
                    <div className="admin-task-action-stack">
                      <button
                        type="button"
                        className="admin-secondary-button admin-task-action-success"
                        onClick={onCreateTask}
                        disabled={!activeKidData || creatingTask || taskStatusRefreshing || restarting || saving}
                      >
                        {creatingTask ? '创建中…' : '创建新任务'}
                      </button>
                      <button
                        type="button"
                        className="admin-secondary-button"
                        onClick={() => activeKidData && onManageKidTasks(activeKidData.id, 'clear-all')}
                        disabled={!activeKidData || taskManagingKidId !== '' || taskStatusRefreshing || restarting || saving || creatingTask}
                      >
                        {taskManagingKidId === `${activeKidData?.id}:clear-all` ? '清理中…' : '清空全部任务'}
                      </button>
                    </div>
                  </div>
                  <p>这里创建的是进入孩子 workspace `tasks/inbox/` 的待领取任务，方便家长直接在管理页投递新任务。</p>
                </article>
              </div>

              <div className="admin-task-workspace">
                <div className="admin-task-columns">
                  {([
                    ['inbox', '待领取', activeTaskStatus?.inbox || []],
                    ['claimed', '进行中', activeTaskStatus?.claimed || []],
                    ['completed', '已完成', activeTaskStatus?.completed || []],
                    ['archived', '已归档', activeTaskStatus?.archived || []],
                  ] as const).map(([key, label, tasks]) => (
                    <section key={key} className="admin-task-column">
                      <div className="admin-task-column-header">
                        <strong>{label}</strong>
                        <span>{tasks.length} 条</span>
                      </div>
                      <div className="admin-task-list">
                        {tasks.length ? tasks.map((task) => {
                          const taskId = String(task.id || `${key}-${String(task.createdAt || '')}`);
                          const isActive = String(selectedTask?.id || '') === String(task.id || '');
                          return (
                            <button
                              key={taskId}
                              type="button"
                              className={isActive ? 'admin-task-card admin-task-card-selectable active' : 'admin-task-card admin-task-card-selectable'}
                              onClick={() => activeKidData && setSelectedTaskIdByKid((prev) => ({
                                ...prev,
                                [activeKidData.id]: String(task.id || ''),
                              }))}
                            >
                              <div className="admin-task-card-top">
                                <strong>{getTaskTitle(task)}</strong>
                                <span className={`admin-task-badge admin-task-badge-${task.status || 'unknown'}`}>{getTaskStatusLabel(task.status)}</span>
                              </div>
                              <div className="admin-task-card-meta">
                                <span>{getTaskTypeLabel(task.type)}</span>
                                <span>{task.targetWordCount ? `${String(task.targetWordCount)} 词` : '未设字数'}</span>
                                <span>{task.rewardType ? `奖励: ${String(task.rewardType)}` : '未设奖励'}</span>
                              </div>
                              <div className="admin-task-card-footer">
                                <span>{task.createdAt ? formatLocalDateTime(String(task.createdAt)) : '时间未知'}</span>
                                <span>{task.createdBy ? `来自 ${String(task.createdBy)}` : '来源未标记'}</span>
                              </div>
                            </button>
                          );
                        }) : (
                          <div className="empty-state">{label}里还没有任务。</div>
                        )}
                      </div>
                    </section>
                  ))}
                </div>

                <aside className="admin-task-detail-panel">
                  <div className="admin-task-detail-header">
                    <div>
                      <span className="admin-task-summary-label">任务详情</span>
                      <h3>{getTaskTitle(selectedTask)}</h3>
                    </div>
                    {selectedTask ? <span className={`admin-task-badge admin-task-badge-${selectedTask.status || 'unknown'}`}>{getTaskStatusLabel(selectedTask.status)}</span> : null}
                  </div>

                  {selectedTask ? (
                    <div className="admin-task-detail-body">
                      <div className="admin-task-detail-state-hint">
                        当前所在列：<strong>{getTaskStateColumnLabel(selectedTaskState)}</strong>
                        <span>可迁移目标：{['pending', 'claimed', 'completed', 'archived'].filter((state) => state !== selectedTaskState).map(getTaskStateColumnLabel).join(' · ')}</span>
                      </div>

                      <div className="admin-task-detail-actions">
                        <button
                          type="button"
                          className="admin-secondary-button admin-task-action-neutral"
                          onClick={() => onMoveSelectedTask('pending')}
                          disabled={!selectedTask?.id || selectedTaskAction !== '' || getTaskStateKey(selectedTask) === 'pending'}
                        >
                          {selectedTaskAction === 'move:pending' ? '处理中…' : '转为待领取'}
                        </button>
                        <button
                          type="button"
                          className="admin-secondary-button admin-task-action-warn"
                          onClick={() => onMoveSelectedTask('claimed')}
                          disabled={!selectedTask?.id || selectedTaskAction !== '' || getTaskStateKey(selectedTask) === 'claimed'}
                        >
                          {selectedTaskAction === 'move:claimed' ? '处理中…' : '标记为进行中'}
                        </button>
                        <button
                          type="button"
                          className="admin-secondary-button admin-task-action-success"
                          onClick={() => onMoveSelectedTask('completed')}
                          disabled={!selectedTask?.id || selectedTaskAction !== '' || getTaskStateKey(selectedTask) === 'completed'}
                        >
                          {selectedTaskAction === 'move:completed' ? '处理中…' : '标记为已完成'}
                        </button>
                        <button
                          type="button"
                          className="admin-secondary-button admin-task-action-muted"
                          onClick={() => onMoveSelectedTask('archived')}
                          disabled={!selectedTask?.id || selectedTaskAction !== '' || getTaskStateKey(selectedTask) === 'archived'}
                        >
                          {selectedTaskAction === 'move:archived' ? '处理中…' : '归档这条任务'}
                        </button>
                        <button
                          type="button"
                          className="admin-secondary-button admin-task-action-neutral"
                          onClick={onCopySelectedTaskJson}
                          disabled={!selectedTask || taskJsonCopying || selectedTaskAction !== ''}
                        >
                          {taskJsonCopying ? '复制中…' : '复制任务 JSON'}
                        </button>
                        <button
                          type="button"
                          className="admin-secondary-button admin-task-action-danger"
                          onClick={onDeleteSelectedTask}
                          disabled={!selectedTask?.id || selectedTaskAction !== ''}
                        >
                          {selectedTaskAction === 'delete' ? '删除中…' : '删除这条任务'}
                        </button>
                      </div>

                      <div className="admin-task-detail-grid">
                        <div className="admin-task-detail-item">
                          <span>任务 ID</span>
                          <strong>{selectedTask.id || '未写入'}</strong>
                        </div>
                        <div className="admin-task-detail-item">
                          <span>任务类型</span>
                          <strong>{getTaskTypeLabel(selectedTask.type)}</strong>
                        </div>
                        <div className="admin-task-detail-item">
                          <span>目标字数</span>
                          <strong>{selectedTask.targetWordCount ? `${String(selectedTask.targetWordCount)} 词` : '未设置'}</strong>
                        </div>
                        <div className="admin-task-detail-item">
                          <span>奖励</span>
                          <strong>{selectedTask.rewardType ? String(selectedTask.rewardType) : '未设置'}</strong>
                        </div>
                        <div className="admin-task-detail-item">
                          <span>奖励主题</span>
                          <strong>{selectedTask.rewardTheme ? String(selectedTask.rewardTheme) : '未设置'}</strong>
                        </div>
                        <div className="admin-task-detail-item">
                          <span>创建来源</span>
                          <strong>{selectedTask.createdBy ? String(selectedTask.createdBy) : '未标记'}</strong>
                        </div>
                        <div className="admin-task-detail-item">
                          <span>创建时间</span>
                          <strong>{selectedTask.createdAt ? formatLocalDateTime(String(selectedTask.createdAt)) : '未知'}</strong>
                        </div>
                        <div className="admin-task-detail-item">
                          <span>Topic</span>
                          <strong>{selectedTask.topic ? String(selectedTask.topic) : '未设置'}</strong>
                        </div>
                      </div>

                      <div className="admin-task-detail-section">
                        <span className="admin-task-detail-section-label">任务说明</span>
                        <div className="admin-task-detail-content">{selectedTask.instructions ? String(selectedTask.instructions) : '这个任务没有额外说明。'}</div>
                      </div>

                      <div className="admin-task-detail-section">
                        <span className="admin-task-detail-section-label">原始字段</span>
                        <pre className="admin-task-json">{JSON.stringify(selectedTask, null, 2)}</pre>
                      </div>
                    </div>
                  ) : (
                    <div className="empty-state">请选择一条任务，在右侧查看完整详情。</div>
                  )}
                </aside>
              </div>
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
