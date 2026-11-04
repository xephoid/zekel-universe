// Space encounters (Encounter.dc.html, build item 5): a recruit adrift, a
// job offer with the legs it would add, a ruin expedition, a ruin found
// with a depth picker that stops at the card's depth. The card stays on the
// left; the choice is the engine's listed moves, drawn as action cards.

import type { LegalMove } from '../../types';
import { asNum, asStr } from '../../types';
import { KIND } from '../cards';
import { Icon } from '../icons';
import { bestAboardIn, moveById, type WwTable } from '../read';
import { TravelCard } from '../TravelCard';
import { ActionCard, Lbl, Num, missionTitles } from '../ui';
import { RollPanel } from './RollPanel';
import type { PartProps } from './SpacePart';

function Legs({ head, legs }: { head: string; legs: Array<{ name: string; n: string; icon: 'idcard' | 'silo' | 'rocket' | 'ringed'; colour?: string; lit?: boolean }> }) {
  return (
    <section className="ww-section">
      <Lbl style={{ fontSize: 11, color: '#b9bdd4' }}>{head}</Lbl>
      {legs.map((l, i) => (
        <div key={i} className={`ww-leg${l.lit ? ' current' : ''}`} style={!l.lit ? { background: '#283063', border: '1px solid #4f5a94', color: '#c9cfee' } : undefined}>
          <span style={{ color: l.lit ? undefined : (l.colour ?? '#aab1d3') }}><Icon name={l.icon} size={18} /></span>
          <span style={{ flex: 1 }}>{l.name}</span><Num>{l.n}</Num>
        </div>
      ))}
      <span className="ww-dim" style={{ fontSize: 12 }}>Cards each way = distance − speed. The paused leg picks up where it stopped once the job is done, win or lose.</span>
    </section>
  );
}

export function EncounterPart(props: PartProps) {
  const { table, input, pressable, onMove } = props;
  const face = table.card;
  const p = table.pending;
  if (!face || !p) return null;
  const kind = KIND[face.kind];
  const aboard = table.ship ? `${1 + table.crew.length}/${table.ship.capacity}` : '';
  let kicker = ''; let title = ''; let lede = '';
  let cards: JSX.Element[] = [];
  let extra: JSX.Element | null = null;
  const journey = table.journey;
  const current = journey.find((l) => l.current);
  const titles = missionTitles(input.reference);
  const currentWords = current ? (current.kind === 'habitat_transfer' ? current.purpose.replace(/^one-way transfer to /, 'to ') : `${current.kind === 'mission_outbound' ? 'out to' : 'back from'} ${(current.missionId && titles[current.missionId]) || current.purpose.replace(/^(outbound|return) — /, '')}`) : '';
  const flyOn = (id: string, name: string, what: string) => {
    const m = moveById(input.legalMoves, id);
    return <ActionCard key={id} icon="rocket" name={name} check="no roll" tag="safe" what={what} onClick={() => m && onMove(m)} disabled={!pressable || !m} off={!m} />;
  };

  if (p.kind === 'space_recruit_offer' || (p.kind === 'roll' && asStr(p['reason']) === 'recruit')) {
    kicker = 'SOMEONE ADRIFT'; title = `${face.title} is hailing you`;
    lede = `${face.line}. Bring them aboard, or fly on.`;
    const tryM = moveById(input.legalMoves, 'attempt-space-recruit');
    const rolling = p.kind === 'roll';
    cards = [
      <ActionCard key="try" icon="convince" name="Try to recruit" check={`3d6 vs ${face.need ?? '?'}`} tag={rolling ? 'chosen' : undefined} chosen={rolling} color={kind.colour} what={`Need ${face.need ?? '?'} on three dice, adding the best ${face.idealized ?? ''} score aboard. ${face.chips?.length ? `If they join: ${face.chips.join(', ')}.` : ''}`} onClick={() => tryM && onMove(tryM)} disabled={!pressable || !tryM || rolling} />,
      ...(rolling ? [] : [flyOn('decline-recruit', 'Fly on', 'They drift on. The card goes to the discard and the leg continues.')]),
    ];
    extra = (
      <section className="ww-odds ww-section">
        <div><Lbl style={{ fontSize: 10, color: '#aab1d3' }}>YOU NEED</Lbl><span className="ww-odds-v" style={{ color: '#f2b544' }}>{face.need ?? '?'} on 3 dice</span><span className="ww-dim" style={{ fontSize: 12 }}>idealizes {face.idealized}</span></div>
        <div><Lbl style={{ fontSize: 10, color: '#aab1d3' }}>ROOM ABOARD</Lbl><span className="ww-odds-v" style={{ color: '#6fd08a' }}>{aboard}</span><span className="ww-dim" style={{ fontSize: 12 }}>{table.ship && 1 + table.crew.length >= table.ship.capacity ? 'full: someone would have to go' : 'space for one more'}</span></div>
        <div><Lbl style={{ fontSize: 10, color: '#aab1d3' }}>IF THEY JOIN</Lbl><span className="ww-odds-v" style={{ color: kind.colour }}>{face.chips?.join(' ') ?? ''}</span><span className="ww-dim" style={{ fontSize: 12 }}>{face.race}</span></div>
      </section>
    );
  } else if (p.kind === 'space_mission_offer') {
    const ruinJob = (face.options ?? []).length === 1;
    kicker = ruinJob ? 'A RUIN EXPEDITION' : 'A JOB IN THE MIDDLE OF NOWHERE';
    title = ruinJob ? `Follow ${face.title}?` : `Take ${face.title}?`;
    lede = ruinJob ? 'No ability needed. Clear the ruin at the far end, then fly back.' : 'Pick one way to do it, or decline. Only a way someone aboard has the ability for is offered.';
    cards = (face.options ?? []).map((o, i) => {
      const m = moveById(input.legalMoves, `accept-mission-${i + 1}`);
      const best = bestAboardIn(m?.description);
      return <ActionCard key={i} icon={ruinJob ? 'conquest' : i === 0 ? 'convince' : 'satcom'} name={ruinJob ? 'Accept' : `Way ${i + 1}: ${o.head}`} check={`${o.head}${best !== null ? ` · best aboard +${best}` : ''}`} tag={m ? undefined : 'no one aboard'} off={!m} color={kind.colour} what={`${o.tail}.${ruinJob ? ' Pays when you clear the map.' : ''}`} onClick={() => m && onMove(m)} disabled={!pressable || !m} />;
    });
    cards.push(flyOn('decline-mission', 'Decline', 'The card goes to the discard and the trip continues.'));
    const dist = (face.options ?? [])[0]?.tail.match(/dist (\d+)/)?.[1];
    extra = (
      <Legs head="YOUR JOURNEY IF YOU ACCEPT" legs={[
        { name: `Out · ${face.id.replace(/C$/, '♣')} ${face.title}`, n: dist ? `0 / ${Math.max(0, Number(dist) - (table.ship?.speed ?? 0))}` : '', icon: 'idcard', lit: true },
        ...(ruinJob ? [{ name: `Ruin · ${(face.options ?? [])[0]?.head ?? ''}`, n: 'map', icon: 'silo' as const, colour: '#f2b544' }] : []),
        { name: `Back · ${face.title}`, n: dist ? `0 / ${Math.max(0, Number(dist) - (table.ship?.speed ?? 0))}` : '', icon: 'idcard' },
        ...(current ? [{ name: `Paused · ${currentWords}`, n: String(current.cardsRemaining), icon: 'rocket' as const }] : []),
      ]} />
    );
  } else if (p.kind === 'ruin_discovery') {
    const max = asNum(p['max_depth'], face.depth ?? 1);
    kicker = 'RUINS ON THE SCANNER'; title = `Enter ${face.title}?`;
    lede = 'Entering is optional. If you go in, choose how many maps deep you will try.';
    const depths = [1, 2, 3].map((d) => ({ d, m: moveById(input.legalMoves, `enter-ruin-${d}`) }));
    cards = [
      ...depths.filter((x) => x.m).map(({ d, m }) => <ActionCard key={d} icon="silo" name={`Enter · depth ${d}`} check={d === max ? 'the deepest level' : `R1${d > 1 ? ` then R${d}` : ' only'}`} color={kind.colour} what="Set up the party, start spot and threat level on the next screen." onClick={() => m && onMove(m)} disabled={!pressable} />),
      flyOn('skip-ruin', 'Fly on', 'Leave it behind. The card goes to the discard.'),
    ];
    extra = (
      <section className="ww-section">
        <Lbl style={{ fontSize: 11, color: '#b9bdd4' }}>HOW DEEP WILL YOU GO?</Lbl>
        <div className="ww-row" style={{ gap: 12, alignItems: 'flex-start' }}>
          {[1, 2, 3].map((d) => (
            <span key={d} className="ww-col" style={{ alignItems: 'center', gap: 4 }}>
              <span className="ww-num" style={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, ...(d <= max ? { border: '1.5px solid #6b76ad', background: '#283063' } : { border: '1.5px dashed #3d4880', color: '#4f5a94' }) }}>{d}</span>
              <span style={{ fontSize: 11, color: '#aab1d3' }}>{d > max ? 'not on this card' : d === 1 ? 'R1 only' : `R1 then R${d}`}</span>
            </span>
          ))}
          <span style={{ flex: 1, fontSize: 13, lineHeight: 1.45, color: '#c9cfee', marginLeft: 10 }}>Every visit starts on map R1. Reach the goal to drop a level. Stop at the depth you picked; going deeper means more caches and tougher attackers.</span>
        </div>
      </section>
    );
  }

  return (
    <div className="ww-main">
      <div className="ww-main-card">
        <div className="ww-col" style={{ gap: 4 }}>
          <Lbl style={{ color: kind.colour }}>{kicker}</Lbl>
          <h1 className="ww-h1">{title}</h1>
          <span className="ww-lede">{lede}</span>
        </div>
        <div className={`ww-acts ${cards.length >= 3 ? 'three' : 'two'}`}>{cards}</div>
        {extra}
      </div>
      <RollPanel {...props} />
    </div>
  );
}

export function EncounterCard({ table }: { table: WwTable }) {
  const face = table.card;
  if (!face) return null;
  return (
    <aside className="ww-left" aria-label="The card" style={{ alignItems: 'center' }}>
      <div className="ww-live" style={{ marginTop: 10 }}><TravelCard face={face} /></div>
      <span className="ww-dim" style={{ fontSize: 12, textAlign: 'center' }}>{face.kind === 'recruit' ? 'Fail and they drift on. A ♥ card never marks anyone.' : face.kind === 'job' ? 'Taking a job here stacks it on top of your current trip.' : 'Found ruins pay in caches, beings and XP, not credits.'}</span>
    </aside>
  );
}

export const isEncounterPending = (p: { kind: string; [k: string]: unknown } | null, phase: string): boolean =>
  !!p && (p.kind === 'space_recruit_offer' || p.kind === 'space_mission_offer' || p.kind === 'ruin_discovery' || (p.kind === 'roll' && asStr(p['reason']) === 'recruit' && phase === 'traveling'));

export type { LegalMove };
