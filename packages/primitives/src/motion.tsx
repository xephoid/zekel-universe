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
//
// A card's flight is a ghost: a copy of the card in a fixed layer over the
// whole table, flown from where the card was to where it is, while the
// card itself waits hidden in place. So a card crossing from the bench into
// a scrolling board, or out of a row that clips, is never cut off and never
// painted behind what it passes. Every other part (a zone, a pool, a pawn)
// moves within its own box and slides in place.

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
    // A hidden document gets no animation frames: an animation started now
    // would leave every moved part displaced until the tab is seen again.
    // Record the new positions and let the next visible change animate.
    if (typeof document !== 'undefined' && document.hidden) {
      for (const el of elements) next.set(el.dataset.flipId!, rectOf(el));
      prevRects.current = next;
      return;
    }

    // Measure first, animate second: a from-transform set on a zone would
    // otherwise displace the cards inside it before they are measured.
    const measured: Array<{ el: HTMLElement; id: string; rect: Rect; prev: Rect | undefined }> = [];
    for (const el of elements) {
      const id = el.dataset.flipId!;
      let prev = prevRects.current.get(id);
      let rect: Rect;
      const flight = flights.get(el);
      if (flight) {
        if (!keyChanged) {
          // Mid-flight and nothing changed: keep the position the flight is
          // heading to. A drop animates the part itself, so measuring it
          // now would read the animation as a position.
          next.set(id, prev ?? rectOf(el));
          continue;
        }
        // New data during a flight: the part continues from where its
        // ghost visibly is, so the flight is cut and the part measured.
        prev = flight.ghost ? rectOf(flight.ghost) : rectOf(el);
        flight.done();
      }
      rect = rectOf(el);
      next.set(id, rect);
      measured.push({ el, id, rect, prev });
    }
    const flying = new Set<string>();
    if (keyChanged && !firstMeasure) {
      for (const { id, rect, prev } of measured) {
        if (prev ? Math.abs(prev.left - rect.left) >= 1 || Math.abs(prev.top - rect.top) >= 1 : true) flying.add(id);
      }
    }
    for (const { el, rect, prev } of measured) {
      if (!keyChanged || firstMeasure) continue;
      if (prev) {
        // Moved: slide from where it was to where it is, lifting on the way.
        const dx = prev.left - rect.left;
        const dy = prev.top - rect.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        if (reduced) {
          fade(el, ms, ease);
          continue;
        }
        if (el.classList.contains('zk-card')) fly(root, el, rect, `translate(${dx}px, ${dy}px)`, ms, ease, flying);
        else slide(el, `translate(${dx}px, ${dy}px)`, ms, ease);
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
        const fromTransform = `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(0.7)`;
        if (el.classList.contains('zk-card')) fly(root, el, rect, fromTransform, ms, ease, flying);
        else slide(el, fromTransform, ms, ease);
      } else {
        drop(el);
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

interface Flight {
  /** the copy in flight, when the flight is a ghost */
  ghost: HTMLElement | null;
  /** end the flight now: the part shows where it is */
  done: () => void;
}

/** Parts in flight, each with its own way to end. */
const flights = new WeakMap<HTMLElement, Flight>();

/** The fixed layer the ghosts fly in, made once per root, above the table
 *  and below the sheets. Inside the root so the palette variables apply. */
function layerOf(root: HTMLElement): HTMLElement {
  let layer = root.querySelector<HTMLElement>(':scope > .zk-flights');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'zk-flights';
    root.appendChild(layer);
  }
  return layer;
}

/**
 * Fly a ghost of `el` from `fromTransform` (relative to `rect`, where the
 * part now is) to rest, while the part waits hidden in place. Parts inside
 * the ghost that fly on their own are left out of the copy.
 */
function fly(root: HTMLElement, el: HTMLElement, rect: Rect, fromTransform: string, ms: number, ease: string, flying: Set<string>) {
  flights.get(el)?.done();
  const base = el.dataset.baseTransform ?? '';
  const ghost = el.cloneNode(true) as HTMLElement;
  // The copy is not a part: it must never be measured or lit.
  for (const part of [ghost, ...Array.from(ghost.querySelectorAll<HTMLElement>('[data-flip-id]'))]) {
    const id = part.dataset.flipId;
    if (part !== ghost && id && flying.has(id)) part.style.visibility = 'hidden';
    delete part.dataset.flipId;
    delete part.dataset.flipFrom;
    part.removeAttribute('id');
    part.removeAttribute('tabindex');
  }
  ghost.classList.remove('zk-lit');
  ghost.classList.add('zk-ghost', 'zk-lift');
  Object.assign(ghost.style, {
    position: 'absolute', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`,
    margin: '0', boxSizing: 'border-box', visibility: 'visible', animation: 'none', translate: 'none',
    transition: 'none', transform: `${fromTransform} ${base}`.trim(),
  });
  layerOf(root).appendChild(ghost);
  el.style.visibility = 'hidden';
  let timer: ReturnType<typeof setTimeout> | null = null;
  let frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(() => {
      ghost.style.transition = `transform ${ms}ms ${ease}, box-shadow ${ms}ms ${ease}`;
      ghost.style.transform = base;
      ghost.addEventListener('transitionend', done);
      timer = setTimeout(done, ms + 50);
    });
  });
  function done() {
    cancelAnimationFrame(frame);
    if (timer !== null) clearTimeout(timer);
    ghost.removeEventListener('transitionend', done);
    ghost.remove();
    el.style.visibility = '';
    flights.delete(el);
  }
  flights.set(el, { ghost, done });
}

/** A part that is not a card moves in place: its own transform slides
 *  from where it was to rest, lifting on the way. */
function slide(el: HTMLElement, fromTransform: string, ms: number, ease: string) {
  flights.get(el)?.done();
  const base = el.dataset.baseTransform ?? '';
  el.style.transition = 'none';
  el.style.transform = `${fromTransform} ${base}`.trim();
  el.classList.add('zk-lift');
  el.style.zIndex = '30';
  let timer: ReturnType<typeof setTimeout> | null = null;
  let frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(() => {
      el.style.transition = `transform ${ms}ms ${ease}, box-shadow ${ms}ms ${ease}`;
      el.style.transform = base;
      el.addEventListener('transitionend', done);
      timer = setTimeout(done, ms + 50);
    });
  });
  function done() {
    cancelAnimationFrame(frame);
    if (timer !== null) clearTimeout(timer);
    el.removeEventListener('transitionend', done);
    el.style.transition = '';
    el.style.transform = base;
    el.style.zIndex = '';
    el.classList.remove('zk-lift');
    flights.delete(el);
  }
  flights.set(el, { ghost: null, done });
}

/** No origin to fly from: the part drops in from above and settles, in place. */
function drop(el: HTMLElement) {
  flights.get(el)?.done();
  el.style.animation = 'none';
  // Force a reflow so the animation restarts when a class is reused.
  void el.offsetWidth;
  el.style.animation = `zk-drop var(--motion-drop, 420ms) var(--motion-settle, cubic-bezier(0.2, 0.9, 0.3, 1.2))`;
  const timer = setTimeout(done, 470);
  function done() {
    clearTimeout(timer);
    el.style.animation = '';
    flights.delete(el);
  }
  flights.set(el, { ghost: null, done });
}

function fade(el: HTMLElement, ms: number, ease: string) {
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = `zk-fade ${ms}ms ${ease}`;
}
