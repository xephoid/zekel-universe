// Motion: the FLIP technique at the level of the whole table. One root
// measures every element carrying data-flip-id before and after a data
// change and animates the transform between them, so a card leaving a pile
// and arriving in a fan is one movement across zones, not two.
//
// Rules from the brief, enforced here:
//   - Nothing appears in place. A new element flies from the element named
//     by its data-flip-from attribute; with no origin it drops in from above
//     and settles. A fade-in is never used with motion on.
//   - A moving thing lifts: its shadow grows while it travels.
//   - Motion is short: a few hundred milliseconds.
//   - Reduced motion turns movement into a fade and keeps the timing.

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

const SLIDE_MS = 360;

interface FlipContextValue {
  reducedMotion: boolean;
}

const FlipContext = createContext<FlipContextValue>({ reducedMotion: false });

export function useReducedMotion(): boolean {
  return useContext(FlipContext).reducedMotion;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Follows the OS setting, or a forced value (the gallery's toggle). */
export function useSystemReducedMotion(force?: boolean): boolean {
  const [system, setSystem] = useState(prefersReducedMotion);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setSystem(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return force ?? system;
}

interface FlipRootProps {
  /** Changes whenever the board data changed (the event sequence number). */
  viewKey: string | number | null | undefined;
  reducedMotion?: boolean;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

interface Rect { left: number; top: number; width: number; height: number }

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function center(r: Rect): { x: number; y: number } {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function easing(): string {
  if (typeof window === 'undefined') return 'ease';
  return getComputedStyle(document.documentElement).getPropertyValue('--motion-easing').trim() || 'cubic-bezier(0.3, 0.8, 0.4, 1)';
}

function slideMs(): number {
  if (typeof window === 'undefined') return SLIDE_MS;
  const v = getComputedStyle(document.documentElement).getPropertyValue('--motion-slide').trim();
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : SLIDE_MS;
}

/**
 * The table wraps its board, bench and side column in one FlipRoot so
 * movement between any two zones is one flight.
 */
export function FlipRoot({ viewKey, reducedMotion, children, className, style }: FlipRootProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const prevRects = useRef<Map<string, Rect>>(new Map());
  const prevKey = useRef<typeof viewKey>(undefined);
  const reduced = useSystemReducedMotion(reducedMotion);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const keyChanged = prevKey.current !== viewKey;
    prevKey.current = viewKey;
    const next = new Map<string, Rect>();
    const elements = Array.from(root.querySelectorAll<HTMLElement>('[data-flip-id]'));
    const currentById = new Map<string, HTMLElement>();
    for (const el of elements) currentById.set(el.dataset.flipId!, el);

    const ms = slideMs();
    const ease = easing();
    const firstMeasure = prevRects.current.size === 0;

    for (const el of elements) {
      const id = el.dataset.flipId!;
      const rect = rectOf(el);
      next.set(id, rect);
      if (!keyChanged || firstMeasure) continue;
      const prev = prevRects.current.get(id);
      if (prev) {
        // Moved: slide from where it was to where it is, lifting on the way.
        const dx = prev.left - rect.left;
        const dy = prev.top - rect.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        if (reduced) {
          fade(el, ms, ease);
          continue;
        }
        animateTransform(el, `translate(${dx}px, ${dy}px)`, ms, ease, true);
        continue;
      }
      // New: fly from its origin, or drop in.
      const fromId = el.dataset.flipFrom;
      const originRect = fromId ? (prevRects.current.get(fromId) ?? (currentById.get(fromId) ? rectOf(currentById.get(fromId)!) : undefined)) : undefined;
      if (reduced) {
        fade(el, ms, ease);
        continue;
      }
      if (originRect) {
        const from = center(originRect);
        const to = center(rect);
        animateTransform(el, `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(0.7)`, ms, ease, true);
      } else {
        el.style.animation = 'none';
        // Force a reflow so the animation restarts when a class is reused.
        void el.offsetWidth;
        el.style.animation = `zk-drop var(--motion-drop, 420ms) var(--motion-settle, cubic-bezier(0.2, 0.9, 0.3, 1.2))`;
      }
    }
    prevRects.current = next;
  });

  // Keep the last-known rects honest when the window changes shape.
  useEffect(() => {
    const onResize = () => {
      const root = ref.current;
      if (!root) return;
      const next = new Map<string, Rect>();
      root.querySelectorAll<HTMLElement>('[data-flip-id]').forEach((el) => next.set(el.dataset.flipId!, rectOf(el)));
      prevRects.current = next;
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <FlipContext.Provider value={{ reducedMotion: reduced }}>
      <div ref={ref} className={className} style={style} data-motion={reduced ? 'reduced' : 'full'}>
        {children}
      </div>
    </FlipContext.Provider>
  );
}

function animateTransform(el: HTMLElement, fromTransform: string, ms: number, ease: string, lift: boolean) {
  const base = el.dataset.baseTransform ?? '';
  el.style.transition = 'none';
  el.style.transform = `${fromTransform} ${base}`.trim();
  if (lift) el.classList.add('zk-lift');
  el.style.zIndex = '30';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.style.transition = `transform ${ms}ms ${ease}, box-shadow ${ms}ms ${ease}`;
      el.style.transform = base;
      const done = () => {
        el.style.transition = '';
        el.style.zIndex = '';
        el.classList.remove('zk-lift');
        el.removeEventListener('transitionend', done);
      };
      el.addEventListener('transitionend', done);
      setTimeout(done, ms + 50);
    });
  });
}

function fade(el: HTMLElement, ms: number, ease: string) {
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = `zk-fade ${ms}ms ${ease}`;
}
