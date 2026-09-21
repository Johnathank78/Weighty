/**
 * Zoom gestures refused (D1, asked by the product owner). The viewport meta covers the engines that
 * honour `user-scalable=no` and `touch-action: pan-x pan-y` covers pinch and double tap elsewhere;
 * iOS Safari ignores both in the browser, so its WebKit gesture events are refused here too.
 *
 * Only multi-finger zoom gestures are refused: scrolling, taps and the app's own drags are untouched,
 * and no `touchmove` listener is installed so scrolling stays passive.
 */
const ZOOM_GESTURES = ['gesturestart', 'gesturechange', 'gestureend'] as const;

export function blockZoomGestures(target: EventTarget = document): () => void {
  const refuse = (event: Event) => event.preventDefault();
  for (const name of ZOOM_GESTURES) target.addEventListener(name, refuse, { passive: false });
  return () => {
    for (const name of ZOOM_GESTURES) target.removeEventListener(name, refuse);
  };
}
