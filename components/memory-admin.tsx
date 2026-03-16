'use client';

import { useState } from 'react';

export function MemoryAdmin(props: {
  graceMemory: string;
  georgeMemory: string;
}) {
  const [activeKid, setActiveKid] = useState<'grace' | 'george'>('grace');
  const [graceMemory, setGraceMemory] = useState(props.graceMemory);
  const [georgeMemory, setGeorgeMemory] = useState(props.georgeMemory);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  const currentValue = activeKid === 'grace' ? graceMemory : georgeMemory;
  const setCurrentValue = activeKid === 'grace' ? setGraceMemory : setGeorgeMemory;

  async function onSave() {
    setSaving(true);
    setStatus('');

    try {
      const response = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kidId: activeKid,
          content: currentValue,
        }),
      });

      if (!response.ok) {
        throw new Error('保存失败');
      }

      setStatus('已保存');
    } catch {
      setStatus('保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="shell home memory-admin-page">
      <section className="hero hero-kids">
        <h1>记忆管理</h1>
        <p>查看和编辑 Grace / George 当前智能体的 MEMORY.md。</p>
      </section>

      <section className="memory-admin-shell">
        <aside className="memory-admin-sidebar">
          <button className={activeKid === 'grace' ? 'memory-kid active' : 'memory-kid'} onClick={() => setActiveKid('grace')}>
            🌸 Grace
          </button>
          <button className={activeKid === 'george' ? 'memory-kid active' : 'memory-kid'} onClick={() => setActiveKid('george')}>
            🚀 George
          </button>
        </aside>

        <section className="memory-admin-main">
          <div className="memory-admin-topbar">
            <strong>{activeKid === 'grace' ? 'Grace MEMORY.md' : 'George MEMORY.md'}</strong>
            <button onClick={onSave} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </button>
          </div>

          <textarea
            className="memory-editor"
            value={currentValue}
            onChange={(event) => setCurrentValue(event.target.value)}
          />

          {status ? <div className="memory-status">{status}</div> : null}
        </section>
      </section>
    </main>
  );
}
