import { useEffect, useState } from 'react';
import type { ThemePreference } from '@/domain/types';

function systemDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
}

/** Applies the theme to <html data-theme> and the browser theme-color. Light is the default. */
export function useTheme(preference: ThemePreference): 'light' | 'dark' {
  const [system, setSystem] = useState(systemDark);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const onChange = () => setSystem(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const resolved = preference === 'system' ? (system ? 'dark' : 'light') : preference;
  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', resolved === 'dark' ? '#151412' : '#F8F5F1');
  }, [resolved]);
  return resolved;
}
