// Docked at a habitat (Habitat.dc.html, build item 5): named rows for the
// missions, the shop and the cantina with their stamps, the visit's
// actions on the right, and the overlays for equip, release, tinker and
// fabricate. Every row and button is a listed move; a row with no move is
// drawn but not pressable.

import { useState } from 'react';
import { asStr } from '../../types';
import { Icon } from '../icons';
import { moveById, type WwTable } from '../read';
import { ActionCard, CrewPanel, GoldButton, Lbl, Num, ShipPanel, Token } from '../ui';
import { RollPanel } from './RollPanel';
import type { PartProps } from './SpacePart';

type Overlay = 'equip' | 'release' | 'workshop' | null;

const STAMP: Record<string, { word: string; cls: string }> = {
  passed: { word: 'PASSED', cls: 'green' }, failed: { word: 'FAILED', cls: 'red' }, sold: { word: 'SOLD', cls: 'grey' }, marked: { word: 'MARKED', cls: 'red' }, hired: { word: 'ABOARD', cls: 'gold' },
};

const ITEM_ICON = (type: string) => (type === 'weapon' ? 'gun' : type === 'armor' ? 'armor' : type === 'consumable' ? 'drink' : type === 'ship_part' ? 'rocket' : 'tag') as 'gun' | 'armor' | 'drink' | 'rocket' | 'tag';

export function HabitatMain({ table, input, pressable, onMove, phone }: PartProps) {
  const h = table.habitat;
  if (!h) return null;
  const find = (id: string) => moveById(input.legalMoves, id);
  const pips = /complete (\d+) missions \(any result; (\d+) done\)/.exec(h.progression);
  return (
    <div className="ww-main-card" style={{ padding: phone ? 14 : '24px 26px' }}>
      <div className="ww-hab-head">
        <div className="ww-row" style={{ gap: 18 }}>
          <span><Icon name="ringed" size={phone ? 40 : 60} /></span>
          <div className="ww-col" style={{ gap: 2 }}>
            <Lbl style={{ color: '#FFD700' }}>HABITAT #{h.number}</Lbl>
            <h1 className="ww-hab-title" style={phone ? { fontSize: 28 } : undefined}>{h.name}</h1>
          </div>
        </div>
        <div className="ww-hab-next">
          <Lbl className="ww-dim">TO NEXT HABITAT</Lbl>
          <span style={{ fontSize: 14, textAlign: 'right' }}>{h.progression.replace(/ \(any result; \d+ done\)/, '')}</span>
          {pips && (
            <span className="ww-pips" aria-label={`${pips[2]} of ${pips[1]} missions done`}>
              {Array.from({ length: Number(pips[1]) }, (_, i) => <span key={i} className={i < Number(pips[2]) ? 'on' : ''} />)}
              <Num style={{ fontSize: 13, marginLeft: 6 }}>{pips[2]} of {pips[1]}</Num>
            </span>
          )}
        </div>
      </div>
      <div className="ww-hab-cols">
        <section className="ww-hab-col" aria-label="Missions">
          <div className="ww-hab-col-head"><Icon name="idcard" size={22} /><span className="ww-h2">Missions</span><span className="ww-dim">ability · need</span></div>
          {h.missions.map((m) => {
            const mv = find(`take-mission-${m.id}`);
            const stamp = STAMP[m.status];
            return (
              <button key={m.id} type="button" className={`ww-mrow${stamp ? ' done' : ''}${!mv && !stamp ? ' idle' : ''}`} style={{ gridTemplateColumns: '46px minmax(0, 1fr) auto' }} disabled={!pressable || !mv} onClick={() => mv && onMove(mv)} aria-label={`${m.title}${stamp ? `, ${stamp.word.toLowerCase()}` : mv ? '' : ', no one aboard has the ability'}`}>
                <span className="ww-mrow-chip"><Lbl style={{ fontSize: 11, letterSpacing: '.08em' }}>{m.ability ?? `R${m.depth}`}</Lbl>{m.depth ? <Icon name="chest" size={14} /> : <Num style={{ fontSize: 14, lineHeight: 1 }}>{m.need}</Num>}</span>
                <span className="ww-mrow-mid"><span className="ww-mrow-name">{m.title}</span><span className="ww-mrow-meta">{m.distance} away · {m.credits.toLocaleString('en-US')}c · {m.xp} XP{m.depth ? ' · no roll' : ''}</span></span>
                <span className="ww-mrow-end">{stamp ? <span className={`ww-stamp ${stamp.cls}`}>{stamp.word}</span> : !mv ? <span style={{ fontSize: 12, fontWeight: 600, color: '#8f98c2' }}>no one</span> : null}</span>
              </button>
            );
          })}
        </section>
        <section className="ww-hab-col" aria-label="Shop">
          <div className="ww-hab-col-head"><Icon name="tag" size={22} /><span className="ww-h2">Shop</span><span className="ww-dim">each sells once</span></div>
          {h.shop.map((s) => {
            const mv = s.id ? find(`buy-${s.id}`) : undefined;
            const sold = s.status === 'sold';
            return (
              <button key={s.index} type="button" className={`ww-mrow${sold ? ' done' : ''}${!mv && !sold ? ' idle' : ''}`} style={{ gridTemplateColumns: '26px minmax(0, 1fr) auto' }} disabled={!pressable || !mv} onClick={() => mv && onMove(mv)} aria-label={`${s.title}, ${s.cost}c${sold ? ', sold' : mv ? '' : ', cannot afford'}`}>
                <Icon name={ITEM_ICON(s.type)} size={22} />
                <span className="ww-mrow-mid"><span className="ww-mrow-name">{s.title}</span><span className="ww-mrow-meta">{s.meta || s.name}</span></span>
                <span className="ww-mrow-end"><Num style={{ fontSize: 14 }}>{s.cost.toLocaleString('en-US')}c</Num>{sold && <span className="ww-stamp grey">SOLD</span>}</span>
              </button>
            );
          })}
        </section>
        <section className="ww-hab-col" aria-label="Cantina">
          <div className="ww-hab-col-head"><Icon name="talk" size={22} /><span className="ww-h2">Cantina</span><span className="ww-dim">roll vs need</span></div>
          {h.cantina.map((b) => {
            const mv = b.id ? find(`recruit-${b.id}`) : undefined;
            const stamp = STAMP[b.status];
            return (
              <button key={b.index} type="button" className={`ww-mrow${stamp ? ' done' : ''}${!mv && !stamp ? ' idle' : ''}`} style={{ gridTemplateColumns: '38px minmax(0, 1fr) auto' }} disabled={!pressable || !mv} onClick={() => mv && onMove(mv)} aria-label={`${b.title}${stamp ? `, ${stamp.word.toLowerCase()}` : ''}`}>
                <span style={{ opacity: stamp ? .5 : 1 }}><Token race={b.race} size={36} /></span>
                <span className="ww-mrow-mid"><span className="ww-mrow-name">{b.title}</span><span className="ww-mrow-meta">{b.race.charAt(0).toUpperCase() + b.race.slice(1)}{b.idealized ? ` · ${b.idealized}` : ''}{b.need ? ` · need ${b.need}` : ''}</span></span>
                <span className="ww-mrow-end"><Num style={{ fontSize: 13, textAlign: 'right', lineHeight: 1.25 }}>{b.chips.map((c) => <span key={c} style={{ display: 'block' }}>{c}</span>)}</Num>{stamp && <span className={`ww-stamp ${stamp.cls}`}>{stamp.word}</span>}</span>
              </button>
            );
          })}
        </section>
      </div>
    </div>
  );
}

function VisitButton({ icon, name, sub, move, gold, pressable, onMove, onClick, disabled }: { icon: 'crack' | 'credits' | 'convince' | 'talk'; name: string; sub: string; move?: ReturnType<typeof moveById>; gold?: boolean; pressable: boolean; onMove: PartProps['onMove']; onClick?: () => void; disabled?: boolean }) {
  return (
    <button type="button" className={`ww-visit-btn${gold ? ' gold' : ''}`} disabled={disabled ?? (!pressable || !move)} onClick={onClick ?? (() => move && onMove(move))}>
      <span className="ww-visit-icon"><Icon name={icon} size={22} /></span>
      <span className="ww-col" style={{ flex: 1 }}><span style={{ fontWeight: 600 }}>{name}</span><span className="ww-dim" style={{ fontSize: 12 }}>{sub}</span></span>
    </button>
  );
}

export function VisitPanel(props: PartProps & { overlay: Overlay; setOverlay(o: Overlay): void }) {
  const { table, input, pressable, onMove, overlay, setOverlay } = props;
  const h = table.habitat;
  if (!h) return null;
  const find = (id: string) => moveById(input.legalMoves, id);
  const repair = find('attempt-repair'); const pay = find('pay-repair'); const unrest = find('attempt-reduce-unrest'); const docks = find('recruit-unnamed'); const depart = find('depart');
  const equips = input.legalMoves.filter((m) => m.move['type'] === 'equip_item');
  const releases = input.legalMoves.filter((m) => m.move['type'] === 'release_crew');
  const workshop = input.legalMoves.filter((m) => m.move['type'] === 'upgrade_item' || m.move['type'] === 'fabricate_part');
  const numbers = (d: string | undefined) => { const m = /3d6 \+ (\w+)[^0-9]*(\d+)\+?/.exec(d ?? ''); return m ? `3d6 + ${m[1]}, need ${m[2]}` : ''; };
  return (
    <section className="ww-panel" aria-label="This visit">
      <Lbl className="ww-panel-label">THIS VISIT</Lbl>
      <VisitButton icon="crack" name="Repair roll" sub={repair ? `${numbers(repair.description)} · once` : h.repairRoll ? 'needs MEC aboard and a damaged ship' : 'done this arrival'} move={repair} gold={!!repair} pressable={pressable} onMove={onMove} />
      <VisitButton icon="credits" name="Pay for repair" sub={pay ? '150c a step' : table.ship?.damage === 'pristine' ? 'the ship is pristine' : 'not enough credits'} move={pay} pressable={pressable} onMove={onMove} />
      <VisitButton icon="convince" name="Ease unrest" sub={unrest ? `${numbers(unrest.description)} · once` : h.unrestRoll ? 'needs LEA aboard and an angry crew' : 'done this arrival'} move={unrest} pressable={pressable} onMove={onMove} />
      <VisitButton icon="talk" name="Work the docks" sub={docks ? `${numbers(docks.description)} · once here` : h.docksRoll ? 'needs DIP aboard, room for a red shirt' : 'done here'} move={docks} pressable={pressable} onMove={onMove} />
      <div className="ww-visit-small">
        <button type="button" disabled={equips.length === 0} onClick={() => setOverlay(overlay === 'equip' ? null : 'equip')}>Equip</button>
        <button type="button" disabled={releases.length === 0} onClick={() => setOverlay(overlay === 'release' ? null : 'release')}>Release</button>
        <button type="button" onClick={() => setOverlay(overlay === 'workshop' ? null : 'workshop')}>{workshop.length ? 'Tinker' : 'Tinker · locked'}</button>
      </div>
      <div className="ww-col" style={{ gap: 10, marginTop: 6 }}>
        <GoldButton onClick={() => depart && onMove(depart)} disabled={!pressable || !depart}>{depart ? (/FINALE/.test(depart.description ?? '') ? 'ENTER THE FINALE' : 'DEPART') : 'DEPART'}</GoldButton>
        {!depart && <span className="ww-dim" style={{ fontSize: 12, textAlign: 'center' }}>{h.progression.replace(/ \(any result; (\d+) done\)/, ' ($1 done)')}</span>}
      </div>
    </section>
  );
}

/** The equip, release and workshop overlays over the habitat. */
export function HabitatOverlay(props: PartProps & { overlay: Overlay; setOverlay(o: Overlay): void }) {
  const { table, input, pressable, onMove, overlay, setOverlay } = props;
  if (!overlay) return null;
  const close = () => setOverlay(null);
  const beings = [table.me, ...table.crew].filter((b): b is NonNullable<typeof b> => !!b);
  const equips = input.legalMoves.filter((m) => m.move['type'] === 'equip_item');
  const releases = input.legalMoves.filter((m) => m.move['type'] === 'release_crew');
  const upgrades = input.legalMoves.filter((m) => m.move['type'] === 'upgrade_item');
  const fabs = input.legalMoves.filter((m) => m.move['type'] === 'fabricate_part');
  const itemName = (id: string) => table.items.find((i) => i.id === id)?.name ?? '';
  let kicker = ''; let title = ''; let lede = ''; let foot = ''; let body: JSX.Element | null = null;
  if (overlay === 'equip') {
    kicker = 'EQUIP GEAR'; title = 'Who wears what?'; lede = 'Every being wears at most one weapon and one armor. You can change gear while docked.';
    foot = 'Consumables are not worn: anyone aboard can use one, declared before the roll. Crew who walk out at 3 anger take their weapon and armor with them.';
    const loose = table.items.filter((i) => (i.type === 'weapon' || i.type === 'armor') && !beings.some((b) => Object.values(b.equipped).includes(i.id)));
    body = (
      <div className="ww-col" style={{ gap: 8 }}>
        {beings.map((b) => (
          <div key={b.name} style={{ display: 'grid', gridTemplateColumns: '200px minmax(0, 1fr) minmax(0, 1fr)', gap: 10, alignItems: 'center' }}>
            <span className="ww-row" style={{ gap: 10 }}><Token race={b.race} size={38} /><span style={{ fontWeight: 600 }}>{b.name}</span></span>
            {(['weapon', 'armor'] as const).map((slot) => {
              const worn = b.equipped[slot];
              const options = equips.filter((m) => asStr(m.move['being']) === b.name && table.items.find((i) => i.name === asStr(m.move['item_name']))?.type === slot);
              return (
                <span key={slot} className="ww-col" style={{ gap: 4 }}>
                  <span className={`ww-slot${worn ? ' on' : ''}`}><Icon name={slot === 'weapon' ? 'gun' : 'armor'} size={18} />{worn ? itemName(worn) : `no ${slot}`}</span>
                  {options.map((m) => <button key={m.move_id} type="button" className="ww-slot btn" disabled={!pressable} onClick={() => onMove(m)}><Icon name={slot === 'weapon' ? 'gun' : 'armor'} size={18} />put on {asStr(m.move['item_name'])}</button>)}
                </span>
              );
            })}
          </div>
        ))}
        {loose.length > 0 && <div className="ww-row" style={{ gap: 12, padding: '12px 14px', borderRadius: 12, border: '1.5px solid #FFD700', background: '#3a3520' }}><Lbl style={{ fontSize: 11, color: '#FFD700' }}>HOLDING</Lbl><span style={{ flex: 1 }}>{loose.map((i) => i.name).join(' · ')}</span></div>}
      </div>
    );
  } else if (overlay === 'release') {
    kicker = 'RELEASE CREW'; title = 'Let someone go?'; lede = 'They leave the ship here. Over capacity, you must release someone before you can depart.';
    foot = 'The captain can never be released.';
    body = (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
        {table.crew.map((c) => {
          const m = releases.find((r) => asStr(r.move['crew_name']) === c.name);
          return (
            <div key={c.name} className="ww-release">
              <Token race={c.race} size={52} />
              <span className="ww-col" style={{ flex: 1 }}><span className="ww-h2" style={{ fontSize: 18 }}>{c.name}</span><span className="ww-dim" style={{ fontSize: 12 }}>{c.race} · anger {c.anger}</span></span>
              <button type="button" className="ww-release-btn" disabled={!pressable || !m} onClick={() => m && onMove(m)}>RELEASE</button>
            </div>
          );
        })}
      </div>
    );
  } else {
    kicker = 'TINKER AND FABRICATE'; title = upgrades.length + fabs.length > 0 ? 'The workshop is open' : 'The workshop is closed to you'; lede = 'Both need a skilled mechanic aboard: a natural MEC 3.';
    foot = 'Tinker turns a weapon or armor into an MK-II, worth +1 more, once per item. Fabricate builds a +1 ship part, once per visit.';
    body = (
      <div className="ww-col" style={{ gap: 12 }}>
        {(upgrades.length > 0 || fabs.length > 0) ? (
          <div className="ww-acts two">
            {upgrades.map((m) => <ActionCard key={m.move_id} icon="gun" name={`Tinker · ${asStr(m.move['item_name'])}`} check="200c" what={(m.description ?? '').replace(/^Tinker \(A16\): pay 200c — /, '')} onClick={() => onMove(m)} disabled={!pressable} />)}
            {fabs.map((m) => <ActionCard key={m.move_id} icon="rocket" name={`Fabricate · +1 ${asStr(m.move['stat'])}`} check="400c" what={(m.description ?? '').replace(/^Shipwright \(A18\): pay 400c — /, '')} onClick={() => onMove(m)} disabled={!pressable} />)}
          </div>
        ) : (
          <div className="ww-locked"><Lbl>LOCKED</Lbl><span style={{ flex: 1 }}>Needs a natural MEC 3 aboard; items do not count. Raising MEC at level up, or a recruit with MEC 3, would open it.</span></div>
        )}
      </div>
    );
  }
  return (
    <div className="ww-ov" role="presentation" onClick={close}>
      <div className="ww-modal" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="ww-row between" style={{ alignItems: 'flex-start', gap: 20 }}>
          <div className="ww-col" style={{ gap: 4 }}><Lbl style={{ color: '#FFD700' }}>{kicker}</Lbl><span className="ww-h1" style={{ fontSize: 30 }}>{title}</span><span className="ww-lede">{lede}</span></div>
          <button type="button" className="ww-modal-close" aria-label="Close" onClick={close}>✕</button>
        </div>
        {body}
        <span className="ww-dim" style={{ fontSize: 12, lineHeight: 1.5 }}>{foot}</span>
      </div>
    </div>
  );
}

export function HabitatPart(props: PartProps & { right: (node: JSX.Element) => JSX.Element }) {
  const [overlay, setOverlay] = useState<Overlay>(null);
  const { table } = props;
  return (
    <>
      <div className="ww-main">
        <HabitatMain {...props} />
        {table.pending?.kind === 'roll' && <RollPanel {...props} />}
      </div>
      {props.right(
        <>
          <VisitPanel {...props} overlay={overlay} setOverlay={setOverlay} />
          <ShipPanel table={table} compact />
          <CrewPanel table={table} />
        </>,
      )}
      <HabitatOverlay {...props} overlay={overlay} setOverlay={setOverlay} />
    </>
  );
}
