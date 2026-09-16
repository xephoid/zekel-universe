import { useEffect, useMemo, useRef, useState } from 'react';
import type { TableEventWire } from '@universe/shared';
import { PlaybackQueue, type Pace, type PlaybackState } from './PlaybackQueue';

export interface PlaybackApi {
  state: PlaybackState;
  pace: Pace;
  setPace: (p: Pace) => void;
  push: (e: TableEventWire) => void;
  replayFromStart: () => void;
  resumeFrom: (events: TableEventWire[]) => void;
}

/** React wrapper over PlaybackQueue. One instance per table route mount. */
export function usePlaybackQueue(initialPace: Pace = 1): PlaybackApi {
  const queueRef = useRef<PlaybackQueue | null>(null);
  if (!queueRef.current) queueRef.current = new PlaybackQueue();
  const queue = queueRef.current;

  const [state, setState] = useState<PlaybackState>(queue.snapshot);
  const [pace, setPaceState] = useState<Pace>(initialPace);

  useEffect(() => {
    const unsub = queue.subscribe(setState);
    return () => { unsub(); queue.dispose(); };
  }, [queue]);

  return useMemo(() => ({
    state,
    pace,
    setPace: (p: Pace) => { setPaceState(p); queue.setPace(p); },
    push: (e: TableEventWire) => queue.push(e),
    replayFromStart: () => queue.replayFromStart(),
    resumeFrom: (events: TableEventWire[]) => queue.resumeFrom(events),
  }), [state, pace, queue]);
}
