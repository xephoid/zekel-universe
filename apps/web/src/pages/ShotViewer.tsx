// The game page's screenshot viewer: a dialog over the page, never a new
// tab. Previous and next step through the game's screenshots (and wrap), as
// do the arrow keys and a swipe on a phone. The X, a click on the backdrop
// and Escape all close it; those three come from the table's own Sheet.

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Sheet } from '@zekel/glue-kit';

export function ShotViewer({ name, shots, start, onClose }: {
  name: string; shots: string[]; start: number; onClose: () => void;
}) {
  const [at, setAt] = useState(start);
  // Which way the last step went, so the new picture slides in from that side.
  const [dir, setDir] = useState<'next' | 'prev' | null>(null);
  const many = shots.length > 1;
  const step = (by: 1 | -1) => {
    if (!many) return;
    setDir(by === 1 ? 'next' : 'prev');
    setAt((i) => (i + by + shots.length) % shots.length);
  };
  const stepRef = useRef(step);
  stepRef.current = step;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // The arrow keys and Escape work wherever focus sits while the viewer is
  // open (the Sheet hears Escape only from inside itself, and stops it there,
  // so this does not close twice), and the page behind does not scroll.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); stepRef.current(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); stepRef.current(-1); }
      else if (e.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, []);

  // A sideways swipe of more than 40px steps; a tap does nothing.
  const downX = useRef<number | null>(null);
  const onPointerDown = (e: PointerEvent) => { downX.current = e.clientX; };
  const onPointerUp = (e: PointerEvent) => {
    if (downX.current === null) return;
    const dx = e.clientX - downX.current;
    downX.current = null;
    if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
  };

  const title = many ? `${name}, screenshot ${at + 1} of ${shots.length}` : `${name}, screenshot`;
  return (
    <Sheet
      title={title}
      onClose={onClose}
      className="shot-viewer"
      heading={<h2>{name} <span className="shot-count">{many ? `${at + 1} of ${shots.length}` : ''}</span></h2>}
    >
      <div className="shot-stage">
        {many && <button type="button" className="btn secondary shot-nav prev" onClick={() => step(-1)} aria-label="Previous screenshot">‹</button>}
        <div className="shot-frame" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { downX.current = null; }}>
          <img key={at} src={shots[at]} alt={`${name}, screenshot ${at + 1}`} className={dir ? `in-${dir}` : undefined} draggable={false} />
        </div>
        {many && <button type="button" className="btn secondary shot-nav next" onClick={() => step(1)} aria-label="Next screenshot">›</button>}
      </div>
    </Sheet>
  );
}
