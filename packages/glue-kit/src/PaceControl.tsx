// The playback pace buttons: ½×, 1×, 2×. Drawn in the table's caption card
// and in a game's own moment overlay.

import { PACES, type Pace } from './types.js';

export function PaceControl({ pace, setPace }: { pace: Pace; setPace: (p: Pace) => void }) {
  return (
    <span className="pace" role="group" aria-label="Playback pace">
      {PACES.map((p) => (
        <button key={p} className={`btn secondary small${pace === p ? ' active' : ''}`} onClick={() => setPace(p)} aria-pressed={pace === p}>
          {p}×
        </button>
      ))}
    </span>
  );
}
