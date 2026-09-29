/**
 * Browser history for the navigation model (UX pass 1, E). The app never piles up entries: there is a base entry, and one
 * "top" entry above it exactly while back has something to close inside the app (`canGoBack`). The system or browser back
 * then lands on the base entry: the app applies its own back (`navBack`) and puts the top entry back if something is still
 * open. On the root of Today there is no top entry, so back leaves the app, as on Android.
 *
 * Every in-app navigation changes the state directly; this module only reconciles the top entry afterwards (`sync`).
 */
export type HistoryLike = {
  readonly state: unknown;
  pushState(data: unknown, unused: string): void;
  replaceState(data: unknown, unused: string): void;
  back(): void;
};

export type HistoryMark = { wheighty: 'base' | 'top' };
const BASE: HistoryMark = { wheighty: 'base' };
const TOP: HistoryMark = { wheighty: 'top' };

const markOf = (state: unknown): HistoryMark['wheighty'] | null => {
  const w = typeof state === 'object' && state !== null ? (state as { wheighty?: unknown }).wheighty : undefined;
  return w === 'base' || w === 'top' ? w : null;
};

export type HistorySync = {
  /** Called once: the entry the app opens on becomes the base. */
  init: () => void;
  /** After every state change: adds or removes the top entry so that it exists exactly when back can act in the app. */
  sync: (canGoBack: boolean) => void;
  /** The popstate listener. */
  onPop: (state: unknown) => void;
};

export function createHistorySync(history: HistoryLike, onSystemBack: () => void): HistorySync {
  let top = false;
  /** Pops the app caused itself (removing the top entry), not to be read as a back. */
  let ownPops = 0;
  return {
    init() {
      history.replaceState(BASE, '');
      top = false;
    },
    sync(canGoBack) {
      if (canGoBack && !top) {
        history.pushState(TOP, '');
        top = true;
      } else if (!canGoBack && top) {
        top = false;
        ownPops++;
        history.back();
      }
    },
    onPop(state) {
      if (ownPops > 0) {
        ownPops--;
        return;
      }
      const mark = markOf(state);
      // Forward to the top entry again: nothing to do, it is there.
      if (mark === 'top') {
        top = true;
        return;
      }
      // Back to the base (or to an entry of an earlier session, which then becomes the base).
      if (mark !== 'base') history.replaceState(BASE, '');
      top = false;
      onSystemBack();
    },
  };
}
