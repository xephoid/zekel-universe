// The roll panel every Warble Way board ends with (build item 5): what the
// dice must make, whose score carries it, the eligible consumables as
// toggles beside Roll, the red shirt the captain may spend on a failed
// hazard, and the Roll or Draw button. Everything comes from the pending the
// engine put on the table and the moves it listed; the button presses the
// table's resolve_report, a toggle sends the listed use_item.

import type { GlueInput, LegalMove } from '../../types';
import { asArr, asNum, asStr, isObj } from '../../types';
import { Icon } from '../icons';
import { statGroups, type WwTable } from '../read';
import { Lbl, Num, GoldButton, Token } from '../ui';

const REASON_WORDS: Record<string, string> = {
  recruit: 'Recruit', repair: 'Repair', reduce_unrest: 'Ease unrest', mission_check: 'Mission', hazard_check: 'Hazard', death_check: 'Death check',
  escape: 'Escape', hack: 'Hack', evade: 'Run silent', volley: 'Open fire', intimidate: 'Intimidate', unnamed_recruit: 'Work the docks', redline: 'Redline',
  space_combat: 'Fight', ground_combat: 'Boarding', item_d6: 'Cache', being_d6: 'Being',
};

export interface RollPanelProps {
  table: WwTable;
  input: GlueInput;
  pressable: boolean;
  onMove(m: LegalMove): void;
  onDraw?: () => void;
  phone?: boolean;
  /** a line of the part's own about the roll, under the main words */
  note?: string;
}

export function abilityName(input: GlueInput, code: string): string {
  for (const g of statGroups(input.reference)) for (const a of g.abilities) if (a.code === code) return a.name;
  return code;
}

export function RollPanel({ table, input, pressable, onMove, onDraw, phone, note }: RollPanelProps) {
  const p = table.pending;
  if (!p) return null;
  const draw = input.legalMoves.find((m) => m.move['type'] === 'resolve_report');
  if (p.kind === 'card_draw') {
    return (
      <section className="ww-roll live" aria-label="Draw">
        <div className="ww-col" style={{ gap: 6 }}>
          <Lbl style={{ color: '#FFD700' }}>DRAW A CARD</Lbl>
          <span className="ww-roll-text">The next travel card. {table.journey[0] ? <>This leg has <b className="ww-num">{table.journey[0].cardsRemaining}</b> to go.</> : null}</span>
          {note && <span className="ww-dim" style={{ fontSize: 13 }}>{note}</span>}
        </div>
        <div className="ww-roll-row">
          <GoldButton big label="Draw" onClick={onDraw} disabled={!pressable || !draw || !onDraw}>DRAW</GoldButton>
        </div>
      </section>
    );
  }
  if (p.kind === 'sacrifice_offer') {
    const spend = input.legalMoves.find((m) => m.move_id === 'sacrifice-unnamed');
    const decline = input.legalMoves.find((m) => m.move_id === 'decline-sacrifice');
    return (
      <section className="ww-roll live" aria-label="The hazard failed">
        <div className="ww-col" style={{ gap: 6 }}>
          <Lbl style={{ color: '#ff9da1' }}>THE ROLL FAILED</Lbl>
          <span className="ww-roll-text">Spend a red shirt to count it as survived, or let the consequence land{asStr(p['carrier_who']) === 'crew' ? ` on ${asStr(p['carrier_name'])}` : ''}.</span>
          <span className="ww-redshirt-note"><Token race="redshirt" size={18} />{table.unnamed} aboard</span>
        </div>
        <div className="ww-roll-row">
          <GoldButton onClick={() => spend && onMove(spend)} disabled={!pressable || !spend}>SPEND A RED SHIRT</GoldButton>
          <GoldButton quiet onClick={() => decline && onMove(decline)} disabled={!pressable || !decline}>LET IT LAND</GoldButton>
        </div>
      </section>
    );
  }
  if (p.kind !== 'roll') return null;
  const dice = asNum(p['dice_count'], 3);
  const reason = asStr(p['reason']);
  const min = typeof p['min_roll'] === 'number' ? p['min_roll'] : null;
  const src = isObj(p['score_source']) ? p['score_source'] : {};
  const ability = asStr(src['ability']);
  const bonus = asNum(src['bonus']);
  const who = asStr(src['who']) === 'crew' ? asStr(src['crew_name']) : 'your own';
  const declared = asArr(p['declared_items']).map((x) => asStr(x));
  const toggles = input.legalMoves.filter((m) => m.move['type'] === 'use_item');
  const declaredItems = table.items.filter((i) => declared.includes(i.id));
  const need = min !== null ? Math.max(0, min - bonus) : null;
  const span = dice * 6 - dice;
  const left = need !== null ? Math.min(100, Math.max(0, ((need - dice) / span) * 100)) : null;
  const word = REASON_WORDS[reason] ?? reason.replace(/_/g, ' ');
  return (
    <section className="ww-roll live" aria-label="Roll">
      <div className="ww-row between" style={{ alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
        <div className="ww-col" style={{ gap: 6, flex: 1, minWidth: 200 }}>
          <Lbl style={{ color: '#FFD700' }}>ROLL {dice} {dice === 1 ? 'DIE' : 'DICE'} · {word.toUpperCase()}</Lbl>
          <span className="ww-roll-text">
            {min !== null ? <>You need <b className="ww-num">{min}</b> or more</> : <>Roll and see</>}
            {ability ? <>, adding {who === 'your own' ? 'your own' : `${who}'s`} {abilityName(input, ability)} <b className="ww-num" style={{ color: '#ece8dc' }}>+{bonus}</b></> : null}
            {declaredItems.length > 0 && <> and {declaredItems.map((i) => i.name).join(', ')}</>}.
          </span>
          {note && <span className="ww-dim" style={{ fontSize: 13 }}>{note}</span>}
          {reason === 'hazard_check' && table.unnamed > 0 && (
            <span className="ww-redshirt-note"><Token race="redshirt" size={18} />If it fails, you may spend a red shirt ({table.unnamed} aboard) to count it as survived.</span>
          )}
        </div>
        {(toggles.length > 0 || declaredItems.length > 0) && (
          <div className="ww-col" style={{ gap: 8 }}>
            {declaredItems.map((i) => (
              <label key={i.id} className="ww-toggle on"><input type="checkbox" checked readOnly /><span style={{ color: '#FFD700' }}><Icon name="drink" size={22} /></span><span>Using <b>{i.name}</b></span></label>
            ))}
            {toggles.map((m) => (
              <label key={m.move_id} className="ww-toggle">
                <input type="checkbox" checked={false} disabled={!pressable} onChange={() => onMove(m)} />
                <span style={{ color: '#FFD700' }}><Icon name="drink" size={22} /></span>
                <span>Use <b>{asStr(m.move['item_name'])}</b> on this roll</span>
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="ww-roll-row">
        {!phone && <div className="ww-dice-slots" aria-hidden="true">{Array.from({ length: dice }, (_, i) => <span key={i} />)}</div>}
        {need !== null && !phone && (
          <div className="ww-odds-bar" aria-hidden="true">
            <div className="ww-odds-track"><span className="pass" style={{ left: `${left}%` }} /><span className="mark" style={{ left: `${left}%` }} /></div>
            <div className="ww-row between" style={{ fontSize: 12, color: '#9aa3c7' }}><Num>{dice}+{bonus}</Num><span>pass from <b className="ww-num" style={{ color: '#FFD700' }}>{min}</b> · the dice need {need}</span><Num>{dice * 6}+{bonus}</Num></div>
          </div>
        )}
        <GoldButton big label="Roll" onClick={onDraw} disabled={!pressable || !draw || !onDraw}>ROLL</GoldButton>
      </div>
    </section>
  );
}
