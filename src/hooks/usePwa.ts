import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let updateServiceWorker: ((reload?: boolean) => Promise<void>) | null = null;

/** Registers the service worker (production only) and exposes update and install affordances. */
export function usePwa(): { needRefresh: boolean; applyUpdate: () => void; canInstall: boolean; install: () => void; offlineReady: boolean } {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    updateServiceWorker = registerSW({
      onNeedRefresh: () => setNeedRefresh(true),
      onOfflineReady: () => setOfflineReady(true),
    });
  }, []);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallPromptEvent);
    };
    const onInstalled = () => setInstallEvent(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  return {
    needRefresh,
    offlineReady,
    applyUpdate: () => {
      void updateServiceWorker?.(true);
    },
    canInstall: installEvent !== null,
    install: () => {
      if (!installEvent) return;
      void installEvent.prompt().finally(() => setInstallEvent(null));
    },
  };
}
