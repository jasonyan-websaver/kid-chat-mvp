'use client';

import { CSSProperties, useMemo, useRef, useState } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import type { KidProfile } from '@/lib/types';

type Theme = {
  name: string;
  color: string;
  soft: string;
  emoji: string;
};

function hexToSoftColor(hex: string) {
  const normalized = hex.replace('#', '').trim();
  const full = normalized.length === 3 ? normalized.split('').map((c) => `${c}${c}`).join('') : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return '#f3f4f6';
  }

  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const soften = (value: number) => Math.round(value + (255 - value) * 0.82);

  return `rgb(${soften(r)}, ${soften(g)}, ${soften(b)})`;
}

function getTheme(initialKid: KidProfile | null, kidId: string): Theme {
  if (initialKid) {
    return {
      name: initialKid.name,
      color: initialKid.accentColor,
      soft: hexToSoftColor(initialKid.accentColor),
      emoji: initialKid.emoji || '💬',
    };
  }

  if (!kidId) {
    return {
      name: 'Kids Chat',
      color: '#111827',
      soft: '#f3f4f6',
      emoji: '💬',
    };
  }

  return {
    name: kidId,
    color: '#111827',
    soft: '#f3f4f6',
    emoji: '💬',
  };
}

const keypad = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '←', '0', '清除'];
const PIN_LENGTH = 4;

export function PinGate({ nextPath, kidId, initialKid }: { nextPath: string; kidId: string; initialKid: KidProfile | null }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submittedPinRef = useRef<string | null>(null);

  const theme = useMemo(() => getTheme(initialKid, kidId), [initialKid, kidId]);
  const pageStyle = {
    ['--pin-soft']: theme.soft,
    ['--pin-color']: theme.color,
  } as CSSProperties;

  async function submitPin(pinToSubmit: string) {
    if (!kidId || loading || pinToSubmit.length !== PIN_LENGTH) return;
    if (submittedPinRef.current === pinToSubmit) return;

    setError('');
    setLoading(true);
    submittedPinRef.current = pinToSubmit;

    try {
      const response = await fetch('/api/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinToSubmit, kidId, next: nextPath }),
      });

      const data = (await response.json()) as { ok?: boolean; error?: string; next?: string };

      if (!response.ok || !data.ok) {
        setError(data.error || 'PIN 不正确');
        submittedPinRef.current = null;
        setPin('');
        return;
      }

      window.location.replace(data.next || nextPath || '/');
    } catch {
      setError('PIN 验证失败，请重试');
      submittedPinRef.current = null;
      setPin('');
    } finally {
      setLoading(false);
    }
  }

  function onKeyPress(key: string) {
    if (loading) return;
    setError('');

    if (key === '←') {
      submittedPinRef.current = null;
      setPin((prev) => prev.slice(0, -1));
      return;
    }

    if (key === '清除') {
      submittedPinRef.current = null;
      setPin('');
      return;
    }

    const nextPin = pin.length >= PIN_LENGTH ? pin : `${pin}${key}`;
    submittedPinRef.current = null;
    setPin(nextPin);

    if (nextPin.length === PIN_LENGTH) {
      void submitPin(nextPin);
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitPin(pin);
  }

  return (
    <main className="pin-page" style={pageStyle}>
      <div className="pin-page-topbar">
        <ThemeToggle />
      </div>

      <section className="pin-card kid-friendly-card">
        <div className="pin-kid-badge" style={{ background: theme.color }}>
          <span>{theme.emoji}</span>
        </div>

        <h1>{theme.name}</h1>
        <p>你好，{theme.name}！请输入你的 4 位 PIN 进入聊天界面。</p>

        <div className="pin-name-card" style={{ color: theme.color }}>
          <span className="pin-name-emoji">{theme.emoji}</span>
          <strong>我是 {theme.name}</strong>
        </div>

        <form onSubmit={onSubmit} className="pin-form">
          <div className="pin-display" aria-label="PIN value">
            {Array.from({ length: PIN_LENGTH }).map((_, index) => (
              <span
                key={index}
                className="pin-dot"
                style={{ background: pin[index] ? theme.color : 'var(--pin-dot-empty)' }}
              />
            ))}
          </div>

          <input
            type="password"
            inputMode="numeric"
            placeholder="输入 PIN"
            value={pin}
            onChange={(event) => {
              const nextPin = event.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH);
              submittedPinRef.current = null;
              setPin(nextPin);
              if (nextPin.length === PIN_LENGTH) {
                void submitPin(nextPin);
              }
            }}
            className="pin-hidden-input"
          />

          <div className="pin-keypad">
            {keypad.map((key) => (
              <button
                key={key}
                type="button"
                className="pin-key"
                onClick={() => onKeyPress(key)}
                style={key === '清除' ? { background: theme.soft, color: theme.color } : undefined}
              >
                {key}
              </button>
            ))}
          </div>

          <button type="submit" disabled={loading || !kidId || pin.length !== PIN_LENGTH} className="pin-submit" style={{ background: theme.color }}>
            {loading ? '验证中…' : '进入聊天'}
          </button>
        </form>

        <div className="pin-helper">
          <a href="/">← 返回首页</a>
        </div>

        {error ? <div className="pin-error">{error}</div> : null}
      </section>
    </main>
  );
}
