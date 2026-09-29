import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { MouseEvent, PointerEvent, ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { BackLabelContext, backLabelFor, DraftStepContext, useNav, ViewActiveContext } from '@/app/navigation';
import type { ScreenId, SwipeAction } from '@/app/navigation';
import type { NavTransition } from '@/app/navModel';
import { swipeCompletes } from '@/app/navModel';

/** Horizontal travel before a swipe is recognised, and the vertical one that hands the gesture to the page scroll. */
const LOCK_PX = 10;
const SETTLE_MS = 220;
/** How far the page under a stacked one sits to the left before it is uncovered (parallax, as on iOS). */
const UNDER_SHIFT = 0.3;

type Side = 'right' | 'left';
type Gesture = {
  id: number;
  x0: number;
  y0: number;
  locked: boolean;
  side: Side;
  action: SwipeAction | null;
  width: number;
  d: number;
  lastX: number;
  lastT: number;
  velocity: number;
};

/** Elements a horizontal drag belongs to: sliders, fields, and anything that scrolls sideways. */
function ownsHorizontalDrag(target: EventTarget | null, root: Element): boolean {
  for (let el = target instanceof Element ? target : null; el && el !== root; el = el.parentElement) {
    if (el.matches('[role="slider"], .range-row, input, textarea, select, [data-no-swipe]')) return true;
    const style = getComputedStyle(el);
    if ((style.overflowX === 'auto' || style.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) return true;
  }
  return false;
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * The screen on display and its horizontal swipes (UX pass 1, E, reworked with John). The screen follows the finger; the
 * one it uncovers is drawn under it (a stacked page going back) or beside it (the neighbouring section), at its own scroll
 * position. The bottom bar is outside and never moves. Released past a third of the width, or flicked, the swipe goes
 * through (`completeSwipe`); otherwise the screen slides back. What a swipe may do comes from the model (`swipeActions`):
 * nothing left of Today, back to the page a stacked page was opened from.
 */
export function SwipeView({ viewKey, content, transition, render }: { viewKey: string; content: ReactNode; transition: NavTransition; render: (screen: ScreenId) => ReactNode }) {
  const { swipe, completeSwipe, scrollOf } = useNav();
  const viewRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const swipedAt = useRef(0);
  const [layer, setLayer] = useState<{ action: SwipeAction; side: Side; left: number; width: number } | null>(null);

  /** Positions of the screen and of the one being uncovered for a travel `d` (positive to the right). */
  const place = useCallback((d: number, width: number, side: Side, action: SwipeAction | null, animate: boolean) => {
    const view = viewRef.current;
    const under = layerRef.current;
    const t = animate ? `transform ${SETTLE_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)` : 'none';
    if (view) {
      view.style.transition = t;
      view.style.transform = d === 0 ? '' : `translateX(${d}px)`;
    }
    // Fixed footers of the page (the journal's add button) travel with it.
    document.documentElement.style.setProperty('--swipe-x', `${d}px`);
    if (under && action) {
      under.style.transition = t;
      const x = action.kind === 'back' ? -width * UNDER_SHIFT * (1 - d / width) : side === 'right' ? d - width : d + width;
      under.style.transform = `translateX(${x}px)`;
    }
  }, []);

  // The uncovered screen is mounted when the swipe locks; put it where the finger already is.
  useLayoutEffect(() => {
    const g = gesture.current;
    if (layer && g) place(g.d, g.width, g.side, g.action, false);
  }, [layer, place]);

  /**
   * End of a swipe. Carried through, the new screen is committed synchronously first (flushSync), and only then is the
   * view put back in place, in the same frame: the old screen never shows again at its origin, no blank frame.
   */
  const finish = (action: SwipeAction | null) => {
    gesture.current = null;
    flushSync(() => {
      if (action) completeSwipe(action);
      setLayer(null);
    });
    document.documentElement.style.removeProperty('--swipe-x');
    const view = viewRef.current;
    if (view) {
      view.style.transition = '';
      view.style.transform = '';
    }
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    // Touch only: a mouse drag selects text.
    if (e.pointerType === 'mouse' || gesture.current || !e.isPrimary) return;
    if (ownsHorizontalDrag(e.target, e.currentTarget)) return;
    gesture.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, locked: false, side: 'right', action: null, width: 0, d: 0, lastX: e.clientX, lastT: e.timeStamp, velocity: 0 };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    if (!g.locked) {
      if (Math.abs(dx) < LOCK_PX && Math.abs(dy) < LOCK_PX) return;
      const side: Side = dx > 0 ? 'right' : 'left';
      const action = swipe[side];
      // Vertical: the page scrolls. Nothing that way (left of Today, left on a stacked page): nothing happens.
      if (Math.abs(dy) >= Math.abs(dx) || !action) {
        gesture.current = null;
        return;
      }
      const shell = e.currentTarget.parentElement?.getBoundingClientRect();
      Object.assign(g, { locked: true, side, action, width: shell?.width ?? window.innerWidth });
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* capture unsupported */
      }
      if (action.reveal !== null) setLayer({ action, side, left: shell?.left ?? 0, width: g.width });
    }
    const dt = Math.max(1, e.timeStamp - g.lastT);
    g.velocity = 0.8 * ((e.clientX - g.lastX) / dt) + 0.2 * g.velocity;
    g.lastX = e.clientX;
    g.lastT = e.timeStamp;
    g.d = g.side === 'right' ? Math.max(0, dx) : Math.min(0, dx);
    place(g.d, g.width, g.side, g.action, false);
  };

  const release = (e: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    if (!g.locked || !g.action) {
      gesture.current = null;
      return;
    }
    swipedAt.current = Date.now();
    const sign = g.side === 'right' ? 1 : -1;
    const action = g.action;
    const through = !cancelled && swipeCompletes(sign * g.d, sign * g.velocity, g.width);
    if (reducedMotion()) {
      finish(through ? action : null);
      return;
    }
    place(through ? sign * g.width : 0, g.width, g.side, action, true);
    // The new screen replaces the drawn copy exactly where it stands.
    window.setTimeout(() => finish(through ? action : null), SETTLE_MS);
  };

  // A swipe that started on a button is not a tap on it.
  const onClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    if (Date.now() - swipedAt.current < 400) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <>
      {layer && layer.action.reveal !== null ? (
        <div ref={layerRef} className="nav-layer" data-kind={layer.action.kind} style={{ left: layer.left, width: layer.width }} aria-hidden="true" inert>
          <div style={{ transform: `translateY(${-scrollOf(layer.action.revealKey ?? '')}px)` }}>
            <ViewActiveContext.Provider value={false}>
              <BackLabelContext.Provider value={layer.action.kind === 'back' ? backLabelFor(layer.action.under) : null}>
                <DraftStepContext.Provider value={layer.action.kind === 'back' ? (layer.action.step ?? null) : null}>{render(layer.action.reveal)}</DraftStepContext.Provider>
              </BackLabelContext.Provider>
            </ViewActiveContext.Provider>
          </div>
        </div>
      ) : null}
      <div
        key={viewKey}
        ref={viewRef}
        className="nav-view"
        data-transition={transition}
        data-swiping={layer !== null || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => release(e, false)}
        onPointerCancel={(e) => release(e, true)}
        onClickCapture={onClickCapture}
      >
        {content}
      </div>
    </>
  );
}
