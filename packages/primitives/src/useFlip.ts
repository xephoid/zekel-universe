import { useLayoutEffect, useRef } from 'react';

/**
 * FLIP helper: remembers the bounding rect of every child element carrying
 * a data-flip-id attribute, and after a re-render animates elements whose
 * positions changed. Returns the ref to attach to the container.
 *
 * Nothing fades in place — moved pieces slide from their old position to
 * their new one. prefers-reduced-motion is handled by the tokens CSS.
 */
export function useFlip<T extends HTMLElement = HTMLDivElement>(deps: unknown[]) {
  const ref = useRef<T | null>(null);
  const prevRects = useRef<Map<string, DOMRect>>(new Map());

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const next = new Map<string, DOMRect>();
    root.querySelectorAll<HTMLElement>('[data-flip-id]').forEach((el) => {
      const id = el.dataset.flipId!;
      const rect = el.getBoundingClientRect();
      const prev = prevRects.current.get(id);
      if (prev) {
        const dx = prev.left - rect.left;
        const dy = prev.top - rect.top;
        if (dx !== 0 || dy !== 0) {
          el.style.transition = 'none';
          el.style.transform = `translate(${dx}px, ${dy}px)`;
          requestAnimationFrame(() => {
            el.style.transition = `transform var(--motion-slide, 360ms) var(--motion-easing, ease)`;
            el.style.transform = '';
          });
        }
      }
      next.set(id, rect);
    });
    prevRects.current = next;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}
