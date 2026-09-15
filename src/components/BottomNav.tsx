import type { ReactElement } from 'react';

export type TabId = 'today' | 'plan' | 'suivi' | 'analyse' | 'profil';

const TABS: Array<{ id: TabId; label: string; icon: ReactElement }> = [
  {
    id: 'today',
    label: "Aujourd'hui",
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="8.6" />
        <path d="M12 7.4v4.9l3.2 1.9" />
      </svg>
    ),
  },
  {
    id: 'plan',
    label: 'Plan',
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
        <rect x="4" y="4.5" width="16" height="15" rx="3.4" />
        <path d="M8 10h8M8 14.2h5" />
      </svg>
    ),
  },
  {
    id: 'suivi',
    label: 'Suivi',
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3.6 15.4l4.8-5.2 3.6 3 8.4-8.4" />
        <path d="M20.4 4.8h-4.2M20.4 4.8V9" />
      </svg>
    ),
  },
  {
    id: 'analyse',
    label: 'Analyse',
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
        <path d="M5 19V11M12 19V5M19 19v-5" />
      </svg>
    ),
  },
  {
    id: 'profil',
    label: 'Profil',
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="9" r="3.6" />
        <path d="M5.6 19.2c1.5-3 3.9-4.4 6.4-4.4s4.9 1.4 6.4 4.4" />
      </svg>
    ),
  },
];

export function BottomNav({ active, onNavigate }: { active: TabId | null; onNavigate: (tab: TabId) => void }) {
  return (
    <nav className="bottom-nav" aria-label="Navigation principale">
      {TABS.map((t) => (
        <button key={t.id} type="button" className="bottom-nav__item" aria-current={active === t.id ? 'page' : undefined} onClick={() => onNavigate(t.id)}>
          {t.icon}
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
