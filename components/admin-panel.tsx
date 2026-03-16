'use client';

import { useEffect, useMemo, useState } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { getUnknownProfileKeysFromJson } from '@/lib/profile-schema';

type TabKey = 'memory' | 'profile' | 'env' | 'text' | 'history';

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
  issues: string[];
};

type EnvValues = {
  kidPins: Record<string, string>;
  adminPin: string;
  useMock: string;
  pm2Name: string;
};

type TextSettings = Record<string, { name: string; emoji: string; accentColor: string; title: string; welcome: string }>;

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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

export function AdminPanel(props: { kids: AdminKid[]; envValues: EnvValues; textSettings: TextSettings; runtimeCheck: RuntimeCheck }) {
  const [activeKid, setActiveKid] = useState(props.kids[0]?.id || '');
  const [activeTab, setActiveTab] = useState<TabKey>('memory');
  const [saving, setSaving] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [agentCheckingKidId, setAgentCheckingKidId] = useState('');
  const [profileEditorMode, setProfileEditorMode] = useState<'json' | 'form'>('json');
  const [allowUnknownProfileFields, setAllowUnknownProfileFields] = useState(false);
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
  const [kidContent, setKidContent] = useState<Record<string, { memory: string; profile: string }>>(
    () =>
      Object.fromEntries(
        props.kids.map((kid) => [kid.id, { memory: kid.memory, profile: kid.profile }]),
      ),
  );
  const [envValues, setEnvValues] = useState<EnvValues>(props.envValues);
  const [textSettings, setTextSettings] = useState<TextSettings>(props.textSettings);

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

  function setKidText(kidId: string, field: 'name' | 'emoji' | 'accentColor' | 'title' | 'welcome', value: string) {
    setTextSettings((prev) => ({
      ...prev,
      [kidId]: {
        ...prev[kidId],
        [field]: value,
      },
    }));
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

        setStatus(data.message || '孩子标题和欢迎语已保存。');
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
                <button onClick={onSave} disabled={saving || restarting || ((activeTab === 'memory' || activeTab === 'profile' || activeTab === 'text') && !activeKidData)}>
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
              <p className="env-admin-note">在这里可以直接修改所有 PIN 和运行模式设置。</p>

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
            </div>
          ) : activeTab === 'text' ? (
            <div className="env-admin-form">
              <p className="env-admin-note">在这里可以修改首页卡片和聊天页会用到的孩子基础信息。</p>

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
