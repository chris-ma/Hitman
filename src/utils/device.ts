export const IS_TOUCH_DEVICE =
  typeof window !== 'undefined' &&
  ('ontouchstart' in window || navigator.maxTouchPoints > 0);

/**
 * The actually-visible viewport size. Prefers `visualViewport` over
 * `window.innerWidth/Height`: on mobile browsers the two can briefly disagree
 * while the address bar/toolbar is animating in or out, which is what causes
 * the renderer/HUD to size themselves to a taller box than what's currently
 * on screen (the "cut off on mobile" symptom).
 */
export function getViewportSize(): { width: number; height: number } {
  const vv = window.visualViewport;
  if (vv) return { width: Math.round(vv.width), height: Math.round(vv.height) };
  return { width: window.innerWidth, height: window.innerHeight };
}

/** Registers `callback` for both resize and mobile visualViewport changes (toolbar show/hide, orientation). */
export function onViewportChange(callback: () => void): void {
  window.addEventListener('resize', callback);
  window.visualViewport?.addEventListener('resize', callback);
  window.visualViewport?.addEventListener('scroll', callback);
}
