import { useCallback, useEffect, useId, useRef, useState } from 'react';
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

/** Pulled further than this, the sheet is dismissed; released before, it slides back into place. */
const DISMISS_AFTER_PX = 110;
/** Kept in step with the transition of `.sheet` in app.css; 0 when motion is reduced (no transition then). */
const SLIDE_OUT_MS = 260;
const slideOutMs = () => (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : SLIDE_OUT_MS);

export function BottomSheet({ open, onClose, title, lead, children, hideTitle, size = 'auto' }: Props) {
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  /** `grabbed` follows the finger with no transition; released, the same transform animates back or out. */
  const [drag, setDrag] = useState<{ y: number; grabbed: boolean }>({ y: 0, grabbed: false });
  const [closing, setClosing] = useState(false);
  const dragStart = useRef<number | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      setClosing(false);
      setDrag({ y: 0, grabbed: false });
    }
    return () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    };
  }, [open]);

  /** Slides the sheet out, then closes it, so a dismissed panel never disappears on the spot. */
  const closeWithSlide = useCallback(() => {
    setClosing((already) => {
      if (already) return already;
      closeTimer.current = window.setTimeout(onClose, slideOutMs());
      return true;
    });
    setDrag((d) => ({ ...d, grabbed: false }));
  }, [onClose]);

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
        closeWithSlide();
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
  }, [open, closeWithSlide]);

  if (!open) return null;

  const onHandleDown = (e: PointerEvent<HTMLElement>) => {
    if (closing) return;
    dragStart.current = e.clientY;
    setDrag({ y: 0, grabbed: true });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const onHandleMove = (e: PointerEvent<HTMLElement>) => {
    if (dragStart.current === null) return;
    const travelled = e.clientY - dragStart.current;
    // Pulling up goes nowhere: the resistance says so instead of the sheet simply not moving.
    setDrag({ y: travelled >= 0 ? travelled : travelled / 6, grabbed: true });
  };
  const onHandleUp = () => {
    if (dragStart.current === null) return;
    dragStart.current = null;
    if (drag.y > DISMISS_AFTER_PX) closeWithSlide();
    // Released short of the threshold: the transform animates back to place (no `grabbed`, so the
    // stylesheet's transition applies again).
    else setDrag({ y: 0, grabbed: false });
  };
  const dragHandlers = { onPointerDown: onHandleDown, onPointerMove: onHandleMove, onPointerUp: onHandleUp, onPointerCancel: onHandleUp };
  const offset = closing ? '100%' : `${Math.round(drag.y)}px`;
  // The scrim thins out as the sheet is pulled away, and is gone by the time it leaves.
  const scrimOpacity = closing ? 0 : drag.y > 0 ? Math.max(0, 1 - drag.y / (DISMISS_AFTER_PX * 3)) : 1;

  return createPortal(
    <div className="sheet-layer" ref={layerRef} data-closing={closing}>
      <button type="button" className="sheet-scrim" aria-label="Fermer" tabIndex={-1} style={{ opacity: scrimOpacity }} onClick={closeWithSlide} />
      <div
        ref={sheetRef}
        className={size === 'fixed' ? 'sheet sheet--fixed' : 'sheet'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-grabbed={drag.grabbed}
        style={{ transform: `translateY(${offset})` }}
      >
        <button type="button" className="sheet__handle" aria-label="Fermer la fenêtre" {...dragHandlers} onClick={() => drag.y === 0 && closeWithSlide()} />
        <h3 id={titleId} className={hideTitle ? 'sr-only' : 'sheet__title'} {...dragHandlers}>
          {title}
        </h3>
        {lead ? <p className="sheet__lead">{lead}</p> : null}
        {size === 'fixed' ? <div className="sheet__body">{children}</div> : children}
      </div>
    </div>,
    document.body,
  );
}
