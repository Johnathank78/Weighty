import { useEffect, useState } from 'react';
import type { ThemePreference } from '@/domain/types';

function systemDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
}

/**
 * D2: theme-color is always the colour actually painted behind the app (--bg), read from the tokens so the
 * two can never drift apart. The document ships one meta per colour scheme, for the first paint before the
 * app knows the chosen theme; from here on a single meta, without `media`, carries the resolved colour.
 */
function applyThemeColor(): void {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  if (!bg) return;
  const metas = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'));
  for (const extra of metas.slice(1)) extra.remove();
  let meta = metas[0];
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.removeAttribute('media');
  meta.setAttribute('content', bg);
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
    applyThemeColor();
  }, [resolved]);
  return resolved;
}
