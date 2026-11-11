// A sheet: the table's one dialog. It traps focus, closes on Escape or a
// tap outside, and hands focus back to whatever opened it.

import { useCallback, useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

/**
 * A sheet is a modal dialog, and behaves like one: focus moves into it when
 * it opens, Tab stays inside while it is open, Escape closes it, and focus
 * goes back to whatever opened it. Without the trap, Tab reached the table's
 * own buttons behind the sheet — which on this table means spending action
 * points by accident while a question is still on screen.
 */
export function Sheet({ title, onClose, children, className, heading }: {
  title: string; onClose: () => void; children: ReactNode;
  /** a class beside `sheet`, for a sheet laid out its own way */
  className?: string;
  /** drawn in place of the plain title heading (the title still names the dialog) */
  heading?: ReactNode;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    // The first thing worth acting on, else the dialog itself.
    const first = box.current?.querySelector<HTMLElement>(
      'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]):not(.close), [href], [tabindex]:not([tabindex="-1"])',
    );
    (first ?? box.current)?.focus();
    return () => {
      const back = opener.current;
      if (back instanceof HTMLElement && document.contains(back)) back.focus();
    };
  }, []);

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
    if (e.key !== 'Tab') return;
    const focusable = [...(box.current?.querySelectorAll<HTMLElement>(
      'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ) ?? [])].filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (focusable.length === 0) { e.preventDefault(); return; }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const here = document.activeElement;
    if (e.shiftKey && (here === first || here === box.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && here === last) { e.preventDefault(); first.focus(); }
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div
        ref={box}
        className={className ? `sheet ${className}` : 'sheet'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="btn secondary small close" onClick={onClose} aria-label="Close">✕</button>
        {heading ?? <h2>{title}</h2>}
        {children}
      </div>
    </div>
  );
}
