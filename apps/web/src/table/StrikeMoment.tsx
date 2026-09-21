// The strike as a moment (docs/design/Fractured Fist Strike.dc.html): both
// hits run at the same time in two lanes, in four beats over the board as
// it still is, then the overlay fades and hands the table back so the event
// lands and the played rows sweep to the discards. Nothing here asks the
// player anything; the only presses are pace and skip. Every number is the
// glue's reading of the engine's before and after views: what was queued,
// what was in the way, what got through.

import { useEffect, useState } from 'react';
import { motionMs } from '@universe/tokens';
import type { Moment, StrikeLane } from '../glue';
import { type Pace } from '../playback/PlaybackQueue';
import { Avatar } from '../ui';
import { PaceControl } from './parts';

/** Beat lengths at 1×, in the motion tokens. */
export const STRIKE_BEATS = {
  locked: motionMs.slow + motionMs.flip,
  travel: motionMs.tumble,
  absorb: motionMs.slow + motionMs.fast,
  land: motionMs.tumble,
  fade: motionMs.drop,
} as const;

const ORDER = ['locked', 'travel', 'absorb', 'land', 'fade'] as const;
type Beat = 0 | 1 | 2 | 3 | 4 | 5;

const CAPTIONS: Record<number, string> = {
  1: 'Both hits are locked in. They land at the same time.',
  2: 'The hits travel.',
  4: 'What gets through comes off stamina.',
  5: 'Both played rows sweep into the discards.',
};

export function StrikeOverlay({ moment, nameFor, youPid, pace, setPace, onDone, reduced }: {
  moment: Moment;
  nameFor: (pid: string) => string;
  youPid: string | null;
  pace: Pace;
  setPace: (p: Pace) => void;
  /** the beats are done (or skipped): let the event land */
  onDone: () => void;
  reduced: boolean;
}) {
  const [beat, setBeat] = useState<Beat>(0);
  const [skipped, setSkipped] = useState(false);

  // One timer per beat; the pace scales every beat the same way.
  useEffect(() => {
    if (skipped) return;
    if (beat === 0) { setBeat(1); return; }
    if (beat >= 5) { const t = setTimeout(onDone, STRIKE_BEATS.fade / pace); return () => clearTimeout(t); }
    const name = ORDER[beat - 1]!;
    const t = setTimeout(() => setBeat((b) => (b + 1) as Beat), STRIKE_BEATS[name] / pace);
    return () => clearTimeout(t);
  }, [beat, pace, skipped, onDone]);

  const skip = () => { setSkipped(true); setBeat(5); onDone(); };
  const label = (pid: string) => (pid === youPid ? 'You' : nameFor(pid));
  const absorbLine = moment.lanes.map((l) => {
    const blocker = label(l.target);
    const absorbed = Math.max(0, Math.min(l.shield, l.hit - l.through));
    return absorbed > 0 ? `${blocker} block${blocker === 'You' ? '' : 's'} ${absorbed}.` : `${blocker} ${blocker === 'You' ? 'have' : 'has'} no defense up.`;
  }).join(' ');
  const caption = beat === 3 ? absorbLine : (CAPTIONS[beat] ?? '');

  return (
    <div className={`strike-scrim${beat >= 5 ? ' closing' : ''}`} role="presentation" style={{ transitionDuration: `${STRIKE_BEATS.fade / pace}ms` }}>
      <div className="strike-panel" role="dialog" aria-label={moment.title} aria-live="polite">
        <div className="strike-head">
          <span className="strike-title">{moment.title}</span>
          <span className="muted">{caption}</span>
        </div>
        <div className="strike-lanes">
          {moment.lanes.map((l) => (
            <Lane key={l.attacker} lane={l} beat={beat} pace={pace} label={label} reduced={reduced} />
          ))}
        </div>
        <div className="strike-controls">
          <span className="muted" style={{ fontSize: 12 }}>Pace</span>
          <PaceControl pace={pace} setPace={setPace} />
          <span style={{ flex: 1 }} />
          <button className="btn secondary small" onClick={skip}>Skip to the end</button>
        </div>
      </div>
    </div>
  );
}

function Lane({ lane, beat, pace, label, reduced }: {
  lane: StrikeLane; beat: Beat; pace: Pace; label: (pid: string) => string; reduced: boolean;
}) {
  const attacker = label(lane.attacker);
  const target = label(lane.target);
  // The absorbed part is the difference between what was queued and what
  // the engine let through; shown, never used for anything.
  const absorbed = Math.max(0, Math.min(lane.shield, lane.hit - lane.through));
  const shown = beat <= 2 ? lane.hit : lane.through;
  const landed = beat >= 4;
  const travelMs = STRIKE_BEATS.travel / pace;
  const note = lane.hit === 0 ? 'nothing queued this round'
    : absorbed > 0 ? `${target} block${target === 'You' ? '' : 's'} ${absorbed} of ${lane.hit}`
    : 'no defense in the way';
  const tokenClass = ['strike-token', beat >= 2 && 'travel', landed && (lane.through > 0 ? 'landed' : 'stopped'), reduced && 'reduced'].filter(Boolean).join(' ');
  return (
    <div className="strike-lane">
      <div className="strike-lane-head">
        <span className="strike-lane-title">{attacker} hit{attacker === 'You' ? '' : 's'} {target}</span>
        <span className="muted">{note}</span>
      </div>
      <div className="strike-stage">
        <div className={tokenClass} style={{ transitionDuration: `${travelMs}ms` }}>{shown}</div>
        {absorbed > 0 && (
          <div className={`strike-absorb${beat >= 3 ? ' on' : ''}`} style={{ animationDuration: `${STRIKE_BEATS.absorb / pace}ms` }}>{absorbed} absorbed</div>
        )}
        <div className={`strike-shield${beat === 3 && absorbed > 0 ? ' flare' : ''}`} style={{ animationDuration: `${STRIKE_BEATS.absorb / pace}ms` }}>{lane.shield}</div>
        <div className="strike-target">
          <Avatar name={target} size={30} />
          <span className="strike-target-name">{target}</span>
          <div className="strike-pips" aria-label={`${target}: ${landed ? lane.after : lane.before} of ${lane.max}`}>
            {Array.from({ length: Math.max(0, lane.max) }, (_, i) => {
              const full = i < Math.max(0, lane.after);
              const lost = !full && i < Math.max(0, lane.before);
              const cls = ['strike-pip', (full || (lost && !landed)) && 'full', lost && landed && 'out'].filter(Boolean).join(' ');
              return <span key={i} className={cls} style={lost ? { transitionDelay: `${((i - Math.max(0, lane.after)) * motionMs.fast) / 2 / pace}ms`, transitionDuration: `${STRIKE_BEATS.land / pace}ms` } : undefined} />;
            })}
          </div>
          <span className={`strike-stam${landed ? ' tick' : ''}`}>{Math.max(0, landed ? lane.after : lane.before)}</span>
        </div>
      </div>
    </div>
  );
}
