import { useEffect, useId, useRef, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  lead?: ReactNode;
  children: ReactNode;
  /** Visually hide the title (still announced). */
  hideTitle?: boolean;
  /**
   * 'fixed': constant height (75 % of the dynamic viewport), capped to the visual viewport so an open
   * software keyboard never hides the sheet; children are laid out in a flex column (J-07).
   */
  size?: 'auto' | 'fixed';
};

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export function BottomSheet({ open, onClose, title, lead, children, hideTitle, size = 'auto' }: Props) {
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || size !== 'fixed') return;
    const vv = window.visualViewport;
    // Keyboard inset: part of the layout viewport covered by the software keyboard (iOS keeps the layout
    // viewport and shrinks the visual one; Android resizes both, the inset is then 0).
    let tallest = Math.max(window.innerHeight, vv?.height ?? 0);
    const apply = () => {
      const layer = layerRef.current;
      if (!layer) return;
      const height = vv ? vv.height : window.innerHeight;
      const inset = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
      tallest = Math.max(tallest, height);
      layer.style.setProperty('--vv-height', `${Math.round(height)}px`);
      layer.style.setProperty('--kb-inset', `${Math.round(inset)}px`);
      // Once 75 % of the screen no longer fits (keyboard open), the sheet drops its visible title.
      layer.dataset.compact = String(height < tallest * 0.75);
    };
    apply();
    vv?.addEventListener('resize', apply);
    vv?.addEventListener('scroll', apply);
    window.addEventListener('resize', apply);
    return () => {
      vv?.removeEventListener('resize', apply);
      vv?.removeEventListener('scroll', apply);
      window.removeEventListener('resize', apply);
    };
  }, [open, size]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => {
      const first = sheetRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? sheetRef.current)?.focus({ preventScroll: true });
    }, 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Tab' && sheetRef.current) {
        const nodes = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (nodes.length === 0) return;
        const first = nodes[0] as HTMLElement;
        const last = nodes[nodes.length - 1] as HTMLElement;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKey);
      root.style.overflow = previousOverflow;
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  if (!open) return null;

  const onHandleDown = (e: PointerEvent<HTMLButtonElement>) => {
    dragStart.current = e.clientY;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const onHandleMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (dragStart.current === null) return;
    setDragY(Math.max(0, e.clientY - dragStart.current));
  };
  const onHandleUp = () => {
    if (dragStart.current === null) return;
    dragStart.current = null;
    if (dragY > 110) onClose();
    setDragY(0);
  };

  return createPortal(
    <div className="sheet-layer" ref={layerRef}>
      <button type="button" className="sheet-scrim" aria-label="Fermer" tabIndex={-1} onClick={onClose} />
      <div
        ref={sheetRef}
        className={size === 'fixed' ? 'sheet sheet--fixed' : 'sheet'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={dragY > 0 ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
      >
        <button type="button" className="sheet__handle" aria-label="Fermer la fenêtre" onPointerDown={onHandleDown} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp} onClick={() => dragY === 0 && onClose()} />
        <h3 id={titleId} className={hideTitle ? 'sr-only' : 'sheet__title'}>
          {title}
        </h3>
        {lead ? <p className="sheet__lead">{lead}</p> : null}
        {size === 'fixed' ? <div className="sheet__body">{children}</div> : children}
      </div>
    </div>,
    document.body,
  );
}
