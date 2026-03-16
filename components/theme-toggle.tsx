'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'kid-chat-theme';

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const isDark = saved === 'dark';
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    window.localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
  }

  return (
    <button className="theme-toggle" onClick={toggleTheme} type="button">
      {dark ? '☀️ 浅色模式' : '🌙 深色模式'}
    </button>
  );
}
