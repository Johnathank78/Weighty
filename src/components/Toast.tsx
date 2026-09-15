import { useRef, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import { Mascot } from '@/components/Mascot';

/** Upward drag (px) beyond which releasing dismisses the toast. */
const DISMISS_DISTANCE_PX = 36;
/** Upward release speed (px/ms) that dismisses even a short flick. */
const DISMISS_VELOCITY = 0.45;
/** Movement (px) before a press becomes a drag, so taps on the action still register. */
const DRAG_SLOP_PX = 6;
const LEAVE_MS = 180;

type Props = { children: ReactNode; action?: ReactNode; onDismiss: () => void };

/** Notification pinned to the top centre; swipe it up to dismiss. */
export function Toast({ children, action, onDismiss }: Props) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const start = useRef<{ y: number; t: number; id: number } | null>(null);
  const last = useRef<{ y: number; t: number }>({ y: 0, t: 0 });

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (leaving) return;
    start.current = { y: e.clientY, t: e.timeStamp, id: e.pointerId };
    last.current = { y: e.clientY, t: e.timeStamp };
  };

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s || e.pointerId !== s.id) return;
    const dy = e.clientY - s.y;
    if (!dragging) {
      if (Math.abs(dy) < DRAG_SLOP_PX) return;
      setDragging(true);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    last.current = { y: e.clientY, t: e.timeStamp };
    // Free upward, strong resistance downward.
    setOffset(dy < 0 ? dy : Math.min(dy * 0.25, 16));
  };

  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    start.current = null;
    if (!s || !dragging) return;
    setDragging(false);
    const dy = e.clientY - s.y;
    const dt = Math.max(1, e.timeStamp - last.current.t + 16);
    const velocity = (e.clientY - last.current.y) / dt;
    if (dy < -DISMISS_DISTANCE_PX || (dy < 0 && velocity < -DISMISS_VELOCITY)) {
      setLeaving(true);
      window.setTimeout(onDismiss, LEAVE_MS);
    } else {
      setOffset(0);
    }
  };

  const onCancel = () => {
    start.current = null;
    setDragging(false);
    setOffset(0);
  };

  const style = leaving
    ? { transform: 'translateY(calc(-100% - 40px))', opacity: 0, transition: `transform ${LEAVE_MS}ms ease-in, opacity ${LEAVE_MS}ms ease-in` }
    : dragging
      ? { transform: `translateY(${offset}px)`, opacity: Math.max(0.35, 1 + offset / 160), transition: 'none' }
      : { transform: 'translateY(0)', opacity: 1, transition: 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.25s ease' };

  return (
    <div className="toast-layer">
      <div className="toast" role="status" style={style} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel}>
        <Mascot variant="clin" width={40} />
        <span>{children}</span>
        {action}
      </div>
    </div>
  );
}
