// In space (Table-Space.dc.html, build item 5): the travel deck and the
// discard on the left of the middle, the drawn card beside them, and the
// choice it asks for. A hazard shows its two ways through as option cards;
// the roll panel below rolls the chosen one. Between cards the panel offers
// the Draw.

import type { GlueInput, LegalMove } from '../../types';
import { asNum, asStr } from '../../types';
import { FAIL_TEXT, KIND, travelCard, type Fail } from '../cards';
import { Icon } from '../icons';
import { bestAboardIn, type WwTable } from '../read';
import { TravelCard, TravelCardBack } from '../TravelCard';
import { Lbl, Num } from '../ui';
import { RollPanel, abilityName } from './RollPanel';

export interface PartProps {
  table: WwTable;
  input: GlueInput;
  pressable: boolean;
  onMove(m: LegalMove): void;
  onForm(template: LegalMove, move: Record<string, unknown>, editableKeys: string[]): void;
  onDraw?: () => void;
  phone?: boolean;
  /** the right column is drawn in the table's side column, not beside the part */
  sideOut?: boolean;
}

/** The deck and the discard as piles, with the last discard face up and small. */
export function Piles({ table, input }: { table: WwTable; input: GlueInput }) {
  // The live card is still the top of the discard in the engine's eyes;
  // while it is drawn large, the pile shows the card under it.
  const d = table.deck.discard;
  const top = table.cardIsLive ? d[d.length - 2] : d[d.length - 1];
  const topFace = top ? travelCard(top, input.reference) : null;
  return (
    <div className="ww-piles">
      <div className="ww-pile">
        <div className="ww-pile-stack" aria-label={`Travel deck, ${table.deck.draw} cards`}>
          <span /><span />
          <span className={`ww-pile-top${table.deck.draw === 0 ? ' empty' : ''}`}><Icon name="swirl" size={48} /></span>
        </div>
        <span>Travel deck · <Num>{table.deck.draw}</Num></span>
      </div>
      <div className="ww-pile">
        <div className="ww-pile-small" aria-label={`Discard, ${table.deck.discardCount} cards${top ? `, ${top} on top` : ''}`}>
          {topFace ? <TravelCard face={topFace} /> : <TravelCardBack />}
        </div>
        <span>Discard · <Num>{table.deck.discardCount}</Num></span>
      </div>
    </div>
  );
}

/** The hazard's two ways through, as the engine lists them. */
function HazardOptions({ table, input, pressable, onMove }: PartProps) {
  const p = table.pending;
  const face = table.card;
  if (!p || p.kind !== 'hazard_option' || !face) return null;
  const mustFail = p['must_fail'] === true;
  const moves = [1, 2].map((n) => input.legalMoves.find((m) => m.move_id === `hazard-option-${n}`));
  return (
    <div className="ww-options">
      <Lbl className="ww-dim">{mustFail ? 'NO ONE ABOARD HAS EITHER · PICK WHAT IT COSTS' : 'CHOOSE A WAY THROUGH'}</Lbl>
      {(face.options ?? []).map((o, i) => {
        const m = moves[i];
        const best = bestAboardIn(m?.description);
        return (
          <button key={i} type="button" className="ww-option" disabled={!pressable || !m} onClick={() => m && onMove(m)}>
            <span className="ww-option-head"><Lbl>OPTION {i + 1}{!m ? ' · NO ONE ABOARD' : ''}</Lbl><span className="ww-option-big">{o.head}</span></span>
            <span style={{ fontSize: 13 }}>If it fails: <b>{o.fail ? FAIL_TEXT[o.fail as Fail] : o.tail}</b></span>
            {m && best !== null && <span className="ww-dim" style={{ fontSize: 13 }}>Best aboard +{best}</span>}
            {m && mustFail && <span className="ww-dim" style={{ fontSize: 13 }}>Take this consequence</span>}
          </button>
        );
      })}
      <span className="ww-dim" style={{ fontSize: 12, lineHeight: 1.45 }}>{mustFail ? 'Neither ability is aboard, so the check fails either way; choose which price to pay.' : 'Only a way someone aboard has the ability for is offered. The best score aboard carries it.'}</span>
    </div>
  );
}

export function SpacePart(props: PartProps) {
  const { table, input, phone } = props;
  const face = table.card;
  const p = table.pending;
  const kind = face ? KIND[face.kind] : null;
  const rollNote = p?.kind === 'roll' && asStr(p['reason']) === 'hazard_check' && face
    ? `Hazard, option ${asNum((p['context'] as Record<string, unknown> | undefined)?.['hazard_option'])}.`
    : p?.kind === 'roll' && asStr(p['reason']) === 'mission_check' ? 'The mission check, at the end of the outbound leg.' : undefined;
  return (
    <div className="ww-main">
      <div className="ww-space-top">
        {!phone && <Piles table={table} input={input} />}
        {face ? (
          <div className="ww-live" style={{ '--ww-kind-glow': kind ? `color-mix(in srgb, ${kind.colour} 25%, transparent)` : undefined } as React.CSSProperties}>
            <TravelCard face={face} />
          </div>
        ) : (
          <div className="ww-pile-stack" aria-label="No card drawn yet"><span /><span /><span className="ww-pile-top empty"><Icon name="nightsky" size={60} /></span></div>
        )}
        <HazardOptions {...props} />
        {p?.kind === 'roll' && asStr(p['reason']) === 'mission_check' && (
          <div className="ww-options">
            <Lbl className="ww-dim">AT THE DESTINATION</Lbl>
            <span style={{ fontSize: 13, lineHeight: 1.45 }}>The job's check, {asStr((p['score_source'] as Record<string, unknown>)?.['ability']) ? `${abilityName(input, asStr((p['score_source'] as Record<string, unknown>)['ability']))}` : 'no ability'} against the number printed. Pass and the pay and XP are yours; the trip back is dealt either way.</span>
          </div>
        )}
      </div>
      <RollPanel {...props} note={rollNote} />
      {!p && table.phase === 'traveling' && <p className="ww-foot">The engine is between cards.</p>}
    </div>
  );
}
