import { useState } from 'react';
import type { ReactNode } from 'react';
import { PLAN_NOTICE_TEXT } from '@/app/copy';
import { Mascot } from '@/components/Mascot';

/**
 * A message of the plan in the short format (pass 5b fixes, point 5): its title, one line with the figures, the long text
 * behind "Détails"; "OK" closes a message of the trace (the warning ahead of BMI 20 has none, it stays while it holds).
 * `children`: the buttons of a card that asks for an answer.
 */
export function ShortNotice({ title, line, detail, tone = 'calm', onClose = null, mascot = 'search', label, children }: { title: string; line: string; detail: string | null; tone?: 'warn' | 'calm'; onClose?: (() => void) | null; mascot?: 'search' | 'surpris'; label?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`note ${tone === 'warn' ? 'note--warn' : ''}`} role="group" aria-label={label ?? title} style={children ? { flexDirection: 'column', alignItems: 'stretch', gap: 10 } : undefined}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Mascot variant={mascot} width={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {title ? <strong style={{ display: 'block', font: '600 14px/1.35 var(--font)' }}>{title}</strong> : null}
          <span style={{ display: 'block' }}>{line}</span>
          {detail ? (
            <button type="button" className="link" style={{ fontSize: 12.5, minHeight: 32, padding: 0 }} aria-expanded={open} onClick={() => setOpen(!open)}>
              {PLAN_NOTICE_TEXT.details}
            </button>
          ) : null}
          {open && detail ? <p style={{ margin: '0 0 4px', font: '400 13px/1.5 var(--font)' }}>{detail}</p> : null}
        </div>
        {onClose ? (
          <button type="button" className="link" onClick={onClose} aria-label={PLAN_NOTICE_TEXT.closeLabel}>
            {PLAN_NOTICE_TEXT.close}
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}
