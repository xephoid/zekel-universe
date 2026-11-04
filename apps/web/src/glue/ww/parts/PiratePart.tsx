// The pirate fight (Pirate.dc.html, build item 5): the pirate's card stays
// on the left with its stamps, the step tracker across the top, the round's
// choice as action cards (the six exchange actions, with the ones the engine
// did not list greyed), boarding, and the captured ship against yours. Every
// button is a listed move; the rolls go through the roll panel.

import { asStr } from '../../types';
import { artFor } from '../cards';
import { Icon } from '../icons';
import { moveById, type WwTable } from '../read';
import { ActionCard, Lbl, Num, Token, GoldButton, DamagePlates } from '../ui';
import { Hologram } from '../holo';
import { faceUrl } from '../faces';
import { RollPanel } from './RollPanel';
import type { PartProps } from './SpacePart';

const STEPS = ['Approach', 'Exchange', 'Board or leave', 'Capture'];

function stepIndex(table: WwTable): number {
  const p = table.pending;
  const stage = table.combat?.stage ?? '';
  if (p?.kind === 'evade_offer' || (p?.kind === 'roll' && asStr(p['reason']) === 'evade')) return 0;
  if (stage === 'captured') return 3;
  if (stage === 'disabled') return 2;
  return 1;
}

export function PirateSteps({ table }: { table: WwTable }) {
  const at = stepIndex(table);
  return (
    <nav className="ww-steps" aria-label="Fight steps">
      {STEPS.map((n, i) => (
        <span key={n} className="ww-row" style={{ gap: 10 }}>
          {i > 0 && <span className={`ww-step-line${i <= at ? ' on' : ''}`} />}
          <span className={`ww-step${i === at ? ' cur' : i < at ? ' done' : ''}`}><span className="ww-step-dot">{i < at ? '✓' : i + 1}</span>{n}</span>
        </span>
      ))}
    </nav>
  );
}

/** The pirate's card: the ship icon, the captain's red token, the numbers, the stamps. */
export function PirateCard({ table }: { table: WwTable }) {
  const face = table.combat?.face ?? table.card;
  if (!face || face.kind !== 'pirate') return null;
  const c = table.combat ?? { card: `♦${face.rank}`, rank: face.rank, stage: '', rerollUsed: false, volleyUsed: false, redlineUsed: false, survivorsUsed: false, pirateDebuff: 0, playerBuff: 0, face };
  const out = c.stage === 'disabled' || c.stage === 'captured';
  const buffs: string[] = [];
  if (c.pirateDebuff) buffs.push(`open fire landed · −${c.pirateDebuff} to them`);
  else if (c.volleyUsed) buffs.push('open fire · tried');
  if (c.playerBuff) buffs.push(`redline · +${c.playerBuff} to you`);
  else if (c.redlineUsed) buffs.push('redline · tried');
  if (c.rerollUsed) buffs.push('Flying Ace reroll · used');
  if (c.stage === 'disabled') buffs.push('disabled');
  if (c.stage === 'captured') buffs.push('captured');
  const captain = faceUrl('pirate-captain');
  return (
    <div className="ww-pirate-card" aria-label={`Pirates ${c.card}`}>
      <div className="ww-pirate-band"><span className="ww-row" style={{ gap: 6 }}><Icon name="skull" size={16} /><Lbl>PIRATES</Lbl></span><Num style={{ fontSize: 14 }}>{c.card.replace('♦', '♦ ')}</Num></div>
      <div className={`ww-pirate-pic${out ? ' out' : ''}`}>
        <Icon name={artFor(face)} size={120} />
        {captain && <span className="ww-pirate-face"><Hologram src={captain} kind="red" size={64} style={{ border: '3px solid #f07070', borderRadius: '50%' }} /></span>}
        {out && <span className={`ww-stamp ${c.stage === 'captured' ? 'gold' : 'green'}`} style={{ position: 'absolute', left: 16, top: 14 }}>{c.stage.toUpperCase()}</span>}
      </div>
      <div className="ww-pirate-body">
        <div className="ww-col"><span className="ww-h2" style={{ fontSize: 24 }}>{face.title}</span><span className="ww-dim" style={{ fontSize: 13 }}>{face.line}</span></div>
        <div className="ww-pirate-attack"><Num>+{face.spaceAttack}</Num><Lbl style={{ fontSize: 11, color: '#aab1d3' }}>SPACE ATTACK</Lbl></div>
        <div className="ww-pirate-stats">{(face.stats ?? []).map((s) => <span key={s.k}><Num>{s.v}</Num><span>{s.k}</span></span>)}</div>
        {buffs.length > 0 && <div className="ww-chips">{buffs.map((b) => <span key={b} className="ww-buff">{b}</span>)}</div>}
      </div>
    </div>
  );
}

const EXCHANGE: Array<{ id: string; name: string; icon: 'starfighter' | 'rocket' | 'satcom' | 'gun' | 'bolt' | 'pirate'; what: string }> = [
  { id: 'fight-round', name: 'Fight', icon: 'starfighter', what: 'Exchange fire: four dice, paired. Win and they are disabled; lose and the ship takes a hit.' },
  { id: 'attempt-escape', name: 'Escape', icon: 'rocket', what: 'Get away. Even a failed escape gets away, after one damage step.' },
  { id: 'attempt-hack', name: 'Hack', icon: 'satcom', what: 'Crash their systems. Success disables them without a fight.' },
  { id: 'open-fire', name: 'Open fire', icon: 'gun', what: 'Once per fight. Success: −2 to their totals for the rest of it. Fail: a free hit on you.' },
  { id: 'redline', name: 'Redline', icon: 'bolt', what: 'Once per fight. Push the engines: +2 to your totals. Fail: a free hit on you.' },
  { id: 'attempt-intimidate', name: 'Intimidate', icon: 'pirate', what: 'Stand down or burn. Success: they break off. Dread adds to the roll.' },
];

/** The check the engine wrote for a move, cut to its numbers ("3d6 + HAK vs 13"). */
function checkOf(description: string | undefined): string {
  const m = /(\d+d6[^.;]*?vs[^.;(]*)/i.exec(description ?? '') ?? /(4d6 pairing)/i.exec(description ?? '');
  return m ? m[1]!.trim() : '';
}

export function PiratePart(props: PartProps) {
  const { table, input, pressable, onMove } = props;
  const p = table.pending;
  const c = table.combat;
  const face = c?.face ?? table.card;
  let kicker = ''; let title = ''; let lede = '';
  let body: JSX.Element | null = null;
  const find = (id: string) => moveById(input.legalMoves, id);
  const stage = c?.stage ?? '';

  if (p?.kind === 'evade_offer' || (p?.kind === 'roll' && asStr(p['reason']) === 'evade')) {
    const run = find('attempt-evade'); const engage = find('decline-evade');
    const rolling = p.kind === 'roll';
    kicker = `${face?.id.replace(/D$/, '') ?? ''}♦ DRAWN · A FIGHT YOU CANNOT IGNORE`; title = `${face?.title ?? 'Pirates'} drop out of the dark`;
    lede = 'Before the shooting starts, a crew with Sneaking can try to slip past.';
    body = (
      <div className="ww-acts two">
        <ActionCard icon="eclipse" name="Run silent" check={checkOf(run?.description) || '3d6 + SNE'} tag={rolling ? 'chosen' : run ? undefined : 'not offered'} chosen={rolling} off={!run && !rolling} what="Success skips the fight; failure just starts it." onClick={() => run && onMove(run)} disabled={!pressable || !run} />
        <ActionCard icon="starfighter" name="Engage" check="start round 1" what="Open the fight. Each round you choose: fight, escape, hack, open fire, redline or intimidate." onClick={() => engage && onMove(engage)} disabled={!pressable || !engage} off={!engage && !rolling} />
      </div>
    );
  } else if (stage === 'loss_reroll_offer') {
    const reroll = find('use-reroll'); const accept = find('accept-result');
    kicker = 'THE DICE ARE IN'; title = 'You lost the exchange';
    lede = 'Before the hit lands, Flying Ace lets you reroll one space-combat exchange per fight.';
    body = (
      <div className="ww-acts two">
        <ActionCard icon="crack" name="Take the hit" check="one damage step" color="#ff9da1" what="Keep the reroll for a worse moment. The ship drops one step and the next round begins." onClick={() => accept && onMove(accept)} disabled={!pressable || !accept} />
        <ActionCard icon="starfighter" name="Reroll · Flying Ace" check="once per fight" tag={reroll ? '1 left' : 'used'} off={!reroll} what="Roll all four dice again. The new result stands, even if it is worse." onClick={() => reroll && onMove(reroll)} disabled={!pressable || !reroll} />
      </div>
    );
  } else if (p?.kind === 'space_combat_action' || (p?.kind === 'roll' && stage === 'choose_action')) {
    const rolling = p.kind === 'roll';
    const reason = rolling ? asStr(p['reason']) : '';
    kicker = rolling ? 'ROLLING' : 'CHOOSE ONE'; title = rolling ? `${(['space_combat'].includes(reason) ? 'Fight' : reason.replace(/_/g, ' '))}: roll` : 'What now?';
    lede = rolling ? 'The dice decide this one.' : 'Fight is the default. The others are gambles: a failed one gives them a free hit.';
    body = (
      <div className="ww-acts three">
        {EXCHANGE.map((a) => {
          const m = find(a.id);
          const chosen = rolling && ((a.id === 'fight-round' && reason === 'space_combat') || (a.id === 'attempt-escape' && reason === 'escape') || (a.id === 'attempt-hack' && reason === 'hack') || (a.id === 'open-fire' && reason === 'volley') || (a.id === 'redline' && reason === 'redline') || (a.id === 'attempt-intimidate' && reason === 'intimidate'));
          const used = (a.id === 'open-fire' && c?.volleyUsed) || (a.id === 'redline' && c?.redlineUsed);
          return <ActionCard key={a.id} icon={a.icon} name={a.name} check={checkOf(m?.description) || (a.id === 'fight-round' ? '4d6 pairing' : '')} tag={chosen ? 'chosen' : used ? 'tried' : m ? undefined : rolling ? undefined : 'not offered'} chosen={chosen} off={!m && !chosen} used={!!used && !chosen} what={a.what} onClick={() => m && onMove(m)} disabled={!pressable || !m || rolling} />;
        })}
      </div>
    );
  } else if (p?.kind === 'boarding_decision' && asStr(p['stage']) === 'board_or_leave' || (p?.kind === 'roll' && stage === 'disabled')) {
    const board = find('board-ship'); const leave = find('leave-pirate'); const talk = find('recruit-survivors');
    const rolling = p.kind === 'roll';
    const reason = rolling ? asStr(p['reason']) : '';
    kicker = 'THEY ARE DISABLED'; title = 'Their engines are dark';
    lede = 'Board them to take the ship, or fly on. You can also try to talk survivors into joining.';
    body = (
      <div className="ww-acts three">
        <ActionCard icon="suit" name="Board" check={checkOf(board?.description) || 'ground 4d6'} tag={rolling && reason === 'ground_combat' ? 'chosen' : undefined} chosen={rolling && reason === 'ground_combat'} what="Win: capture the ship, Dread +1, counts toward Bounty. Lose: whoever boarded makes a death check." onClick={() => board && onMove(board)} disabled={!pressable || !board} off={!board && !rolling} />
        <ActionCard icon="rocket" name="Leave" check="no roll" tag="safe" what="Fly on. The card goes to the discard and the leg continues." onClick={() => leave && onMove(leave)} disabled={!pressable || !leave} off={!leave && !rolling} />
        <ActionCard icon="convince" name="Talk survivors" check={checkOf(talk?.description) || 'once · 3d6 + DIP vs 12'} tag={rolling && reason === 'unnamed_recruit' ? 'chosen' : talk ? undefined : c?.survivorsUsed ? 'tried' : 'not offered'} chosen={rolling && reason === 'unnamed_recruit'} off={!talk && !(rolling && reason === 'unnamed_recruit')} what="Signs one red shirt. Once per victory; the cap is your best DIP." onClick={() => talk && onMove(talk)} disabled={!pressable || !talk} />
      </div>
    );
  } else if (stage === 'captured' || (p?.kind === 'boarding_decision' && asStr(p['stage']) === 'take_or_abandon')) {
    const take = find('take-ship'); const keep = find('abandon-ship');
    kicker = 'BOARDING WON'; title = 'Take their ship, or keep yours?';
    lede = 'A captured ship arrives Hobbled and has no parts. Switching leaves your installed parts behind.';
    const mine = table.ship;
    body = (
      <div className="ww-ships">
        {mine && (
          <div className="ww-ship-card">
            <div className="ww-row" style={{ gap: 12 }}><span style={{ color: '#FFD700' }}><Icon name="ship" size={40} /></span><span className="ww-col"><span className="ww-act-name">{mine.name}</span><span className="ww-dim" style={{ fontSize: 12 }}>yours · keep</span></span></div>
            <div className="ww-col" style={{ gap: 5 }}>
              <span className="ww-kv"><span className="ww-dim">Capacity</span><Num>{mine.capacity}</Num></span>
              <span className="ww-kv"><span className="ww-dim">Speed</span><Num>{mine.speed}</Num></span>
              <span className="ww-kv"><span className="ww-dim">Handling</span><Num>{mine.handling}</Num></span>
              <span className="ww-kv"><span className="ww-dim">Armor</span><Num>{mine.armor}</Num></span>
              <span className="ww-kv"><span className="ww-dim">Damage</span><Num style={{ color: '#f2b544' }}>{mine.damage}</Num></span>
              <span className="ww-kv"><span className="ww-dim">Parts</span><Num>{mine.parts.length} installed</Num></span>
            </div>
            <GoldButton quiet onClick={() => keep && onMove(keep)} disabled={!pressable || !keep}>KEEP {mine.name.toUpperCase()}</GoldButton>
          </div>
        )}
        {face && (
          <div className="ww-ship-card take">
            <div className="ww-row" style={{ gap: 12 }}><span style={{ color: '#ff9da1' }}><Icon name={artFor(face)} size={40} /></span><span className="ww-col"><span className="ww-act-name">{face.title}</span><span className="ww-dim" style={{ fontSize: 12 }}>captured · take</span></span></div>
            <div className="ww-col" style={{ gap: 5 }}>
              {(face.stats ?? []).filter((s) => s.k !== 'ground' && s.k !== 'hack').map((s) => <span key={s.k} className="ww-kv"><span className="ww-dim">{s.k === 'crew' ? 'Capacity' : s.k === 'handl.' ? 'Handling' : 'Speed'}</span><Num>{s.v.replace('+', '')}</Num></span>)}
              <span className="ww-kv"><span className="ww-dim">Damage</span><Num style={{ color: '#ff7a7f' }}>hobbled</Num></span>
              <span className="ww-kv"><span className="ww-dim">Parts</span><Num style={{ color: '#ff9da1' }}>none (yours stay behind)</Num></span>
            </div>
            <GoldButton onClick={() => take && onMove(take)} disabled={!pressable || !take}>TAKE THE SHIP</GoldButton>
          </div>
        )}
      </div>
    );
  } else if (p?.kind === 'roll') {
    kicker = 'ROLLING'; title = asStr(p['reason']).replace(/_/g, ' '); lede = 'The dice decide this one.';
  }

  return (
    <div className="ww-main">
      <div className="ww-main-card">
        <div className="ww-col" style={{ gap: 4 }}>
          <Lbl style={{ color: '#ff9da1' }}>{kicker}</Lbl>
          <h1 className="ww-h1">{title}</h1>
          <span className="ww-lede">{lede}</span>
        </div>
        {body}
        <p className="ww-foot">The best score aboard always carries the roll. Open fire and redline can each be tried once per fight. Disabling, intimidating and hacking do not count toward the Bounty ending; only a won boarding does.</p>
      </div>
      <RollPanel {...props} />
    </div>
  );
}

/** The right column in a fight: the ship's plates and who is aboard with their best scores. */
export function AboardPanel({ table }: { table: WwTable }) {
  const ship = table.ship;
  return (
    <div className="ww-col" style={{ gap: 14 }}>
      {ship && (
        <section className="ww-panel">
          <div className="ww-row between" style={{ gap: 12 }}><span className="ww-row" style={{ minWidth: 0 }}><span style={{ color: '#FFD700' }}><Icon name="ship" size={22} /></span><span className="ww-hand" style={{ fontSize: 19, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ship.name}</span></span><Num className="ww-dim" style={{ fontSize: 12, whiteSpace: 'nowrap', flex: 'none' }}>armor {ship.armor} · handl. {ship.handling}</Num></div>
          <DamagePlates ship={ship} height={22} />
        </section>
      )}
      <section className="ww-panel">
        <Lbl style={{ fontSize: 11, color: '#b9bdd4' }}>ABOARD · BEST SCORES</Lbl>
        {[table.me, ...table.crew].filter((b): b is NonNullable<typeof b> => !!b).map((b) => (
          <div key={b.name} style={{ display: 'grid', gridTemplateColumns: '36px minmax(0, 1fr)', gap: 10, alignItems: 'center' }}>
            <Token race={b.race} size={36} />
            <span className="ww-col"><span style={{ fontWeight: 600, fontSize: 14 }}>{b.name}{b.captain ? ' (you)' : ''}</span><Num className="ww-dim" style={{ fontSize: 11 }}>{b.abilities.filter((a) => a.natural > 0).map((a) => `${a.code} ${a.effective}`).join(' · ') || 'no scores'}</Num></span>
          </div>
        ))}
      </section>
    </div>
  );
}

export const isPirateMoment = (table: WwTable): boolean => {
  const p = table.pending;
  return table.phase === 'space_combat' || !!table.combat || p?.kind === 'evade_offer' || (p?.kind === 'roll' && asStr(p['reason']) === 'evade');
};
