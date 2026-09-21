import { useEffect, useMemo, useRef, useState } from 'react';
import type { TableEventWire } from '@universe/shared';
import { PlaybackQueue, type Gate, type Pace, type PlaybackState } from './PlaybackQueue';

export interface PlaybackApi {
  state: PlaybackState;
  pace: Pace;
  setPace: (p: Pace) => void;
  push: (e: TableEventWire) => void;
  seed: (e: TableEventWire) => void;
  replayLast: () => void;
  resumeFrom: (events: TableEventWire[]) => void;
  lastSeq: () => number;
  /** hold each event before it lands (a moment plays first); null clears it */
  setGate: (gate: Gate | null) => void;
}

const PACE_KEY = 'universe:pace';

function storedPace(): Pace {
  try {
    const v = Number(localStorage.getItem(PACE_KEY));
    if (v === 0.5 || v === 1 || v === 2) return v;
  } catch { /* storage unavailable */ }
  return 1;
}

/** React wrapper over PlaybackQueue. One instance per table route mount. */
export function usePlaybackQueue(): PlaybackApi {
  const queueRef = useRef<PlaybackQueue | null>(null);
  if (!queueRef.current) {
    queueRef.current = new PlaybackQueue();
    queueRef.current.setPace(storedPace());
  }
  const queue = queueRef.current;

  const [state, setState] = useState<PlaybackState>(queue.snapshot);
  const [pace, setPaceState] = useState<Pace>(queue.getPace());

  useEffect(() => {
    const unsub = queue.subscribe(setState);
    return () => { unsub(); };
  }, [queue]);

  useEffect(() => () => queue.dispose(), [queue]);

  return useMemo(() => ({
    state,
    pace,
    setPace: (p: Pace) => {
      setPaceState(p);
      queue.setPace(p);
      try { localStorage.setItem(PACE_KEY, String(p)); } catch { /* storage unavailable */ }
    },
    push: (e: TableEventWire) => queue.push(e),
    seed: (e: TableEventWire) => queue.seed(e),
    replayLast: () => queue.replayLast(),
    resumeFrom: (events: TableEventWire[]) => queue.resumeFrom(events),
    lastSeq: () => queue.snapshot.lastSeq,
    setGate: (gate: Gate | null) => queue.setGate(gate),
  }), [state, pace, queue]);
}
