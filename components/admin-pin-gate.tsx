'use client';

import { CSSProperties, useState } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';

const PIN_LENGTH = 4;
const keypad = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '←', '0', '清除'];

export function AdminPinGate({ nextPath }: { nextPath: string }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const pageStyle = {
    ['--pin-soft']: 'color-mix(in srgb, var(--panel) 88%, #111827 12%)',
    ['--pin-color']: '#111827',
  } as CSSProperties;

  async function submitPin(nextPin: string) {
    if (loading || nextPin.length !== PIN_LENGTH) return;
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/verify-admin-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: nextPin, next: nextPath }),
      });

      const data = (await response.json()) as { ok?: boolean; error?: string; next?: string };
      if (!response.ok || !data.ok) {
        setError(data.error || 'PIN 不正确');
        setPin('');
        return;
      }

      window.location.replace(data.next || '/admin/memory');
    } catch {
      setError('验证失败，请重试');
      setPin('');
    } finally {
      setLoading(false);
    }
  }

  function onKeyPress(key: string) {
    if (loading) return;
    setError('');

    if (key === '←') {
      setPin((prev) => prev.slice(0, -1));
      return;
    }

    if (key === '清除') {
      setPin('');
      return;
    }

    const nextPin = pin.length >= PIN_LENGTH ? pin : `${pin}${key}`;
    setPin(nextPin);
    if (nextPin.length === PIN_LENGTH) {
      void submitPin(nextPin);
    }
  }

  return (
    <main className="pin-page admin-pin-page" style={pageStyle}>
      <div className="pin-page-topbar">
        <ThemeToggle />
      </div>

      <section className="pin-card kid-friendly-card">
        <div className="pin-kid-badge" style={{ background: '#111827' }}>
          <span>🔒</span>
        </div>
        <h1>家长管理</h1>
        <p>请输入家长 PIN 进入管理页面。</p>

        <form className="pin-form" onSubmit={(e) => e.preventDefault()}>
          <div className="pin-display" aria-label="PIN value">
            {Array.from({ length: PIN_LENGTH }).map((_, index) => (
              <span key={index} className="pin-dot" style={{ background: pin[index] ? '#111827' : 'var(--pin-dot-empty)' }} />
            ))}
          </div>

          <div className="pin-keypad">
            {keypad.map((key) => (
              <button
                key={key}
                type="button"
                className="pin-key"
                onClick={() => onKeyPress(key)}
              >
                {key}
              </button>
            ))}
          </div>
        </form>

        <div className="pin-helper">
          <a href="/">← 返回首页</a>
        </div>
        {error ? <div className="pin-error">{error}</div> : null}
      </section>
    </main>
  );
}
