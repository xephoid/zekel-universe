// The pieces every Warble Way screen is built from (build item 5), drawn as
// the boards draw them: labels in Chakra Petch, numbers in Plex Mono, hull
// panels, the gold button, the action card, the ship's damage plates, a
// crew row with its anger dots, the red shirts and dread chips, and the
// captain's sheet. Pictures and words only; what each button sends comes
// from the part that places it.

import type { CSSProperties, ReactNode } from 'react';
import { Hologram } from './holo';
import { Icon, type IconName } from './icons';
import { faceUrl } from './faces';
import { platesLit, type Being, type Captain, type Leg, type Ship, type WwTable } from './read';
import type { GameReferenceResponse } from '@universe/shared';
import { statGroups } from './read';

export const Lbl = ({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) => (
  <span className={['ww-lbl', className].filter(Boolean).join(' ')} style={style}>{children}</span>
);
export const Num = ({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) => (
  <span className={['ww-num', className].filter(Boolean).join(' ')} style={style}>{children}</span>
);

export function Panel({ children, className, label, gold, style, ...rest }: { children: ReactNode; className?: string; label?: string; gold?: boolean; style?: CSSProperties } & Record<`aria-${string}`, string | undefined>) {
  return (
    <section className={['ww-panel', gold && 'gold', className].filter(Boolean).join(' ')} style={style} {...rest}>
      {label && <Lbl className="ww-panel-label">{label}</Lbl>}
      {children}
    </section>
  );
}

/** The gold button: dark words on gold, the way every "go" on the boards is. */
export function GoldButton({ children, onClick, disabled, quiet, className, big, label }: { children: ReactNode; onClick?: () => void; disabled?: boolean; quiet?: boolean; className?: string; big?: boolean; label?: string }) {
  return (
    <button type="button" className={['ww-gold-btn', quiet && 'quiet', big && 'big', className].filter(Boolean).join(' ')} onClick={onClick} disabled={disabled} aria-label={label}>{children}</button>
  );
}

/** One of the boards' action cards: an icon, a name and a tag, the check
 *  it rolls, and what it does. `off` greys it with the reason in the tag. */
export function ActionCard({ icon, name, tag, check, what, chosen, off, used, color, onClick, disabled }: {
  icon: IconName; name: string; tag?: string; check?: string; what?: string; chosen?: boolean; off?: boolean; used?: boolean; color?: string; onClick?: () => void; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={['ww-act', chosen && 'sel', off && 'off', used && 'used'].filter(Boolean).join(' ')}
      onClick={onClick} disabled={disabled || off} aria-pressed={chosen ? true : undefined} aria-disabled={off ? true : undefined}
    >
      <span className="ww-act-icon" style={{ color: off ? '#56609a' : (color ?? '#FFD700') }}><Icon name={icon} size={36} /></span>
      <span className="ww-act-head"><span className="ww-act-name">{name}</span>{tag && <span className="ww-act-tag">{tag}</span>}</span>
      {check && <span className="ww-act-check">{check}</span>}
      {what && <span className="ww-act-what">{what}</span>}
    </button>
  );
}

/** A race token in a ring. */
export function Token({ race, size = 36, ring, label, glow }: { race: string; size?: number; ring?: string; label?: string; glow?: string }) {
  const src = faceUrl(race);
  const style: CSSProperties = { border: ring ? `${size >= 60 ? 3 : 2}px solid ${ring}` : undefined, borderRadius: '50%', boxShadow: glow };
  return src
    ? <Hologram src={src} size={size} label={label} style={style} />
    : <span className="ww-token-blank" style={{ width: size, height: size, ...style }} aria-label={label}>{race.charAt(0).toUpperCase()}</span>;
}

/** Up to three anger dots, red when set. */
export function AngerDots({ anger }: { anger: number }) {
  return (
    <span className="ww-anger" aria-label={`Anger ${anger} of 3`}>
      {[1, 2, 3].map((i) => <span key={i} className={i <= anger ? 'on' : ''} />)}
    </span>
  );
}

/** The ship's damage track: four chevron plates that go dark as they are lost, and the lost ring. */
export function DamagePlates({ ship, height = 26 }: { ship: Ship; height?: number }) {
  const lit = platesLit(ship.damage);
  return (
    <div className="ww-plates" aria-label={`Ship ${ship.damage}, ${lit} of 4 plates`} style={{ '--ww-plate-h': `${height}px` } as CSSProperties}>
      <span className="ww-plates-lost" title="Ship lost"><Icon name="rays" size={Math.round(height * 0.56)} /></span>
      <div className="ww-plates-row">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={i <= lit ? 'ww-plate on' : 'ww-plate'}>{i > lit && <Icon name="crack" size={Math.round(height * 0.42)} />}</span>
        ))}
      </div>
    </div>
  );
}

const DAMAGE_WORD: Record<string, string> = { pristine: 'PRISTINE', used: 'USED', damaged: 'DAMAGED', hobbled: 'HOBBLED' };

/** The ship panel: name in the captain's hand, the plates, the numbers, the parts. */
export function ShipPanel({ table, compact }: { table: WwTable; compact?: boolean }) {
  const ship = table.ship;
  if (!ship) return null;
  const aboard = 1 + table.crew.length;
  const lit = platesLit(ship.damage);
  const parts = table.items.filter((i) => ship.parts.includes(i.id));
  return (
    <Panel className="ww-ship" aria-label="Ship">
      <div className="ww-row between">
        <span className="ww-row"><span style={{ color: '#FFD700' }}><Icon name="ship" size={24} /></span><span className="ww-hand ww-ship-name">{ship.name}</span></span>
        {compact ? <Num className="ww-dim">{aboard}/{ship.capacity} aboard</Num> : <Lbl className="ww-dim">SHIP</Lbl>}
      </div>
      <div className="ww-col" style={{ gap: 7 }}>
        <DamagePlates ship={ship} />
        <div className="ww-row between">
          <span><b className="ww-damage-word">{DAMAGE_WORD[ship.damage] ?? ship.damage.toUpperCase()}</b><span className="ww-dim" style={{ fontSize: 12 }}> · {lit === 0 ? 'lost' : `${lit - 1 === 0 ? 'the next hit loses the ship' : `${lit - 1} hit${lit - 1 === 1 ? '' : 's'} from lost`}`}</span></span>
          <Num className="ww-dim" style={{ fontSize: 11 }}>{['P', 'U', 'D', 'H'].map((l, i) => <span key={l} style={{ color: 4 - i === lit ? '#f2b544' : undefined, fontWeight: 4 - i === lit ? 700 : undefined }}>{i > 0 ? ' · ' : ''}{l}</span>)}</Num>
        </div>
      </div>
      {!compact && (
        <div className="ww-ship-stats">
          <span><Num className="ww-big-num">{ship.speed}</Num><span>Speed</span></span>
          <span><Num className="ww-big-num">{aboard}/{ship.capacity}</Num><span>Aboard</span></span>
          <span><Num className={`ww-big-num${ship.handling ? '' : ' ww-dim'}`}>{ship.handling}</Num><span>Handling</span></span>
          <span><Num className={`ww-big-num${ship.armor ? '' : ' ww-dim'}`}>{ship.armor}</Num><span>Armor</span></span>
        </div>
      )}
      {!compact && parts.length > 0 && <div className="ww-chips">{parts.map((p) => <span key={p.id} className="ww-chip">{p.name}</span>)}</div>}
    </Panel>
  );
}

/** A being's scores as the boards print them: "PIL 3 · SWA 2". */
export function scoreLine(b: Being): string {
  const parts = b.abilities.filter((a) => a.natural > 0 || a.effective > 0).map((a) => `${a.code} ${a.natural}${a.effective !== a.natural ? `${a.effective > a.natural ? '+' : ''}${a.effective - a.natural}` : ''}`);
  return parts.join(' · ');
}

export function CrewRow({ b, ring = '#e8b64a', size = 52, aside }: { b: Being; ring?: string; size?: number; aside?: ReactNode }) {
  return (
    <div className="ww-crew-row">
      <Token race={b.race} size={size} ring={ring} label={`${b.name}, ${b.race}`} />
      <div className="ww-col" style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <span className="ww-hand ww-crew-name">{b.name}</span>
        <Num style={{ fontSize: 12 }}>{b.race.charAt(0).toUpperCase() + b.race.slice(1)}{scoreLine(b) ? ` · ${scoreLine(b)}` : ''}</Num>
      </div>
      {aside ?? <AngerDots anger={b.anger} />}
    </div>
  );
}

/** The red shirts and dread chips, side by side. */
export function Counters({ table, small }: { table: WwTable; small?: boolean }) {
  const dread = table.me?.dread ?? 0;
  const n = table.unnamed;
  return (
    <div className={`ww-counters${small ? ' small' : ''}`}>
      <div className="ww-counter red">
        <div className="ww-row between"><Lbl>RED SHIRTS</Lbl><Num>{n}</Num></div>
        <div className="ww-row" style={{ gap: 5 }}>{Array.from({ length: n }, (_, i) => <Token key={i} race="redshirt" size={small ? 18 : 22} ring="#e8b64a" glow="0 0 6px rgba(240,112,112,.6)" />)}</div>
        {!small && <span className="ww-tiny">Spend one to survive a failed hazard.</span>}
      </div>
      <div className="ww-counter pink">
        <div className="ww-row between"><Lbl>DREAD</Lbl><Num>{dread}<span className="ww-dim">/3</span></Num></div>
        <div className="ww-row" style={{ gap: 5 }}>{[1, 2, 3].map((i) => <span key={i} style={{ color: i <= dread ? '#e070d0' : '#3d3a5e', filter: i <= dread ? 'drop-shadow(0 0 5px rgba(224,112,208,.6))' : undefined }}><Icon name="pirate" size={small ? 18 : 22} /></span>)}</div>
        {!small && <span className="ww-tiny">+1 to intimidate per point.</span>}
      </div>
    </div>
  );
}

export function CrewPanel({ table }: { table: WwTable }) {
  const open = table.ship ? Math.max(0, table.ship.capacity - 1 - table.crew.length) : 0;
  return (
    <Panel className="ww-crew" aria-label="Crew">
      <div className="ww-row between"><Lbl className="ww-dim">CREW</Lbl><span className="ww-dim" style={{ fontSize: 12 }}>{open} open berth{open === 1 ? '' : 's'}</span></div>
      {table.crew.map((b) => <CrewRow key={b.name} b={b} />)}
      {table.crew.length === 0 && <span className="ww-dim" style={{ fontSize: 12 }}>No crew yet. The cantina and the ♥ cards are where they come from.</span>}
      <Counters table={table} />
    </Panel>
  );
}

const LEG_ICON = (l: Leg): IconName => (l.kind === 'habitat_transfer' ? 'ringed' : 'idcard');

/** The journey stack: the current leg lit gold, the rest queued under it. */
export function JourneyPanel({ table, reference }: { table: WwTable; reference: GameReferenceResponse | null }) {
  const legs = table.journey;
  const titles = missionTitles(reference);
  return (
    <Panel className="ww-journey" aria-label="Journey">
      <div className="ww-row between"><Lbl className="ww-dim">JOURNEY</Lbl><span className="ww-dim"><Icon name="rocket" size={20} /></span></div>
      {legs.length === 0 && <span className="ww-dim" style={{ fontSize: 12 }}>Docked. Nothing on the stack.</span>}
      {legs.map((l, i) => (
        <div key={i} className={`ww-leg${l.current ? ' current' : i === legs.length - 1 && legs.length > 1 ? ' paused' : ''}`}>
          <Icon name={LEG_ICON(l)} size={20} />
          <span style={{ flex: 1 }}>{legWords(l, titles)}</span>
          <Num>{l.cardsRemaining}</Num>
        </div>
      ))}
    </Panel>
  );
}

/** The mission titles by id: the habitat pages' missions from the reference
 *  data, and a job from a travel card ("club-7-2") by its card's name. */
export function missionTitles(reference: GameReferenceResponse | null): Record<string, string> {
  const rd = reference?.referenceData;
  const out: Record<string, string> = {};
  const cards = rd && typeof rd === 'object' && rd !== null && 'cards' in rd ? (rd as Record<string, unknown>)['cards'] : null;
  if (cards && typeof cards === 'object') {
    for (const [id, f] of Object.entries(cards as Record<string, unknown>)) {
      const m = /^(A|10|[2-9]|J|Q|K)C$/.exec(id);
      const title = f && typeof f === 'object' && 'title' in f ? String((f as Record<string, unknown>)['title']) : '';
      if (!m || !title) continue;
      out[`club-${m[1]}`] = title;
      out[`club-${m[1]}-1`] = `${title}, way 1`;
      out[`club-${m[1]}-2`] = `${title}, way 2`;
    }
  }
  const habs = rd && typeof rd === 'object' && rd !== null && 'habitats' in rd ? (rd as Record<string, unknown>)['habitats'] : null;
  if (habs && typeof habs === 'object') {
    for (const h of Object.values(habs as Record<string, unknown>)) {
      const ms = h && typeof h === 'object' && 'missions' in h ? (h as Record<string, unknown>)['missions'] : null;
      if (Array.isArray(ms)) for (const m of ms) if (m && typeof m === 'object' && typeof (m as Record<string, unknown>)['id'] === 'string' && typeof (m as Record<string, unknown>)['title'] === 'string') out[(m as Record<string, string>)['id']!] = (m as Record<string, string>)['title']!;
    }
  }
  return out;
}

export function legWords(l: Leg, titles: Record<string, string>): string {
  const title = l.missionId ? titles[l.missionId] : undefined;
  if (l.kind === 'habitat_transfer') return `${l.current ? '' : 'Paused · '}${l.purpose.replace(/^one-way transfer to /, 'to ')}`;
  const way = l.kind === 'mission_outbound' ? 'Out' : 'Back';
  return `${way} · ${title ?? l.purpose.replace(/^(outbound|return) — /, '')}`;
}

/** The captain's sheet, as the in-space board draws it on the left. */
export function Sheet({ table, reference, compact }: { table: WwTable; reference: GameReferenceResponse | null; compact?: boolean }) {
  const me = table.me;
  if (!me) return null;
  const groups = statGroups(reference);
  const by = Object.fromEntries(me.abilities.map((a) => [a.code, a]));
  const xpMax = me.xp + me.xpToNext;
  const gear = table.items.filter((i) => Object.values(me.equipped).includes(i.id));
  const consumables = table.items.filter((i) => i.type === 'consumable' && !i.consumed);
  const endings = Object.entries(table.endings);
  return (
    <section className={`ww-sheet${compact ? ' compact' : ''}`} aria-label="Captain's sheet">
      <div className="ww-row" style={{ gap: 14 }}>
        <Token race={me.race} size={64} ring="#e8b64a" label={`${me.name}, ${me.race}`} />
        <div className="ww-col" style={{ flex: 1, gap: 2 }}>
          <span className="ww-hand ww-sheet-name">{me.name}</span>
          <span className="ww-dim" style={{ fontSize: 13 }}>{me.race.charAt(0).toUpperCase() + me.race.slice(1)}{me.wounded ? ' · wounded' : ''}</span>
        </div>
        <div className="ww-level"><Lbl>LEVEL</Lbl><Num>{me.level}</Num></div>
      </div>
      <div className="ww-col" style={{ gap: 6 }}>
        <div className="ww-row between" style={{ fontSize: 12 }}><Lbl className="ww-dim">XP</Lbl><Num>{me.xp} / {xpMax}{me.xpToNext > 0 ? ` · ${me.xpToNext} to level ${me.level + 1}` : ''}</Num></div>
        <div className="ww-xp" style={{ gridTemplateColumns: `repeat(${Math.max(xpMax, 1)}, minmax(0, 1fr))` }} aria-hidden="true">
          {Array.from({ length: Math.max(xpMax, 1) }, (_, i) => <span key={i} className={i < me.xp ? 'on' : ''} />)}
        </div>
      </div>
      {groups.length > 0 && (
        <div className="ww-stats">
          {groups.map((g) => (
            <div key={g.stat} className="ww-stat-col">
              <Lbl className="ww-stat-head">{g.stat.toUpperCase()}</Lbl>
              {g.abilities.map((a) => {
                const v = by[a.code];
                const nat = v?.natural ?? 0; const eff = v?.effective ?? nat;
                return (
                  <div key={a.code} className={`ww-stat-row${nat === 0 ? ' zero' : ''}${nat >= 3 ? ' three' : ''}`} title={a.name}>
                    <Lbl>{a.code}</Lbl>
                    <Num>{nat}{eff !== nat && <span style={{ color: eff > nat ? '#FFD700' : '#ff9da1' }}>{eff > nat ? '+' : ''}{eff - nat}</span>}</Num>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
      {!compact && (
        <>
          <div className="ww-col" style={{ gap: 8 }}>
            <Lbl className="ww-dim">SKILLS</Lbl>
            <div className="ww-chips">
              {me.skills.length === 0 && <span className="ww-dim" style={{ fontSize: 12 }}>none yet</span>}
              {me.skills.map((s) => <span key={s} className={`ww-chip${/advanced/.test(s) ? ' gold' : ''}`}>{s}</span>)}
            </div>
          </div>
          <div className="ww-col" style={{ gap: 8 }}>
            <Lbl className="ww-dim">INVENTORY</Lbl>
            <div className="ww-inv">
              {gear.map((i) => <span key={i.id} className="ww-inv-slot on"><Icon name={i.type === 'weapon' ? 'gun' : 'armor'} size={24} /><Num style={{ fontSize: 10 }}>{i.name}</Num></span>)}
              {consumables.map((i) => <span key={i.id} className="ww-inv-slot on"><Icon name="drink" size={24} /><Num style={{ fontSize: 10 }}>{i.name}</Num></span>)}
              {Array.from({ length: Math.max(0, 5 - gear.length - consumables.length) }, (_, i) => <span key={`e${i}`} className="ww-inv-slot" />)}
            </div>
          </div>
          {endings.length > 0 && (
            <div className="ww-endings">
              {endings.map(([k, v]) => <div key={k}><Lbl>{k.toUpperCase()}</Lbl><Num>{endingShort(k, v)}</Num></div>)}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** The finish lines as the board abbreviates them: the engine's words, cut to the number. */
function endingShort(key: string, words: string): string {
  const m = /^(\S+)\s/.exec(words);
  if (key === 'conquest') return 'R3';
  if (key === 'fortune') { const n = /^(\d+)\/(\d+)c/.exec(words); return n ? `${Math.round(Number(n[1]) / 100) / 10}k/${Number(n[2]) / 1000}k` : words; }
  if (key === 'legend') { const n = /level (\d+)\/(\d+)/.exec(words); return n ? `L${n[1]}/${n[2]}` : words; }
  return m ? m[1]! : words;
}

/** The galaxy strip across the top: the three habitats and the finale. */
export function GalaxyStrip({ table, reference }: { table: WwTable; reference: GameReferenceResponse | null }) {
  const rd = reference?.referenceData;
  const habs = rd && typeof rd === 'object' && rd !== null && 'habitats' in rd ? (rd as Record<string, unknown>)['habitats'] : null;
  const names = habs && typeof habs === 'object' ? Object.entries(habs as Record<string, unknown>).map(([n, h]) => ({ n: Number(n), name: h && typeof h === 'object' && 'name' in h ? String((h as Record<string, unknown>)['name']) : `#${n}` })).sort((a, b) => a.n - b.n) : [];
  const at = table.habitat?.number ?? 1;
  const travelling = table.phase !== 'at_habitat';
  const widths = [0, 54, 70];
  return (
    <nav className="ww-galaxy" aria-label="Galaxy">
      {names.map((h, i) => (
        <span key={h.n} className="ww-row" style={{ gap: 10 }}>
          {i > 0 && <span className={`ww-galaxy-line${h.n <= at ? ' on' : ''}`} style={{ width: widths[i] ?? 40 }} />}
          {travelling && h.n === at + 1 && <><span style={{ color: '#FFD700' }}><Icon name="ship" size={22} /></span><span className="ww-galaxy-line" style={{ width: 40 }} /></>}
          <span className={`ww-galaxy-stop${h.n === at ? ' here' : h.n < at ? ' past' : ''}`}><span className="ww-galaxy-dot" />#{h.n} {h.name}</span>
        </span>
      ))}
      <span className="ww-galaxy-line" style={{ width: 30 }} /><span className="ww-dim">R3</span>
    </nav>
  );
}

export function Credits({ me }: { me: Captain | null }) {
  return <span className="ww-credits"><Icon name="credits" size={22} /><Num style={{ fontSize: 22 }}>{(me?.credits ?? 0).toLocaleString('en-US')}c</Num></span>;
}
