// The eight primitives as React components, plus a die for roll events.
// Each takes the engine's data shape, an `id` for the part on the table, the
// list of lit part ids, and one select callback. Every part that can be a
// legal-move target lights up and is keyboard-activatable. Parts carry
// data-flip-id attributes so the FlipRoot can move them between zones.

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { handledTransform, themeColor } from './theme.js';
import type {
  BagData, CardData, CardZoneData, GridData, MapData, PoolData, SelectEvent, TableauData, TrackData,
} from './types.js';

export interface PrimitiveProps<T> {
  /** the part id on the table; select events and lit ids use it */
  id: string;
  data: T;
  /** ids of selectable parts (this part, or parts inside it) */
  lit?: ReadonlyArray<string>;
  onSelect?: (e: SelectEvent) => void;
  /** flip id of the element new cards fly in from (a deck, a supply) */
  arriveFrom?: string;
  className?: string;
  style?: CSSProperties;
}

interface LitProps {
  className?: string;
  role?: 'button';
  tabIndex?: number;
  onClick?: (e: { stopPropagation(): void }) => void;
  onKeyDown?: (e: KeyboardEvent) => void;
}

function litProps(isLit: boolean, fire: () => void): LitProps {
  if (!isLit) return {};
  return {
    className: 'zk-lit',
    role: 'button' as const,
    tabIndex: 0,
    onClick: (e: { stopPropagation(): void }) => { e.stopPropagation(); fire(); },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); fire(); }
    },
  };
}

function cx(...parts: Array<string | false | undefined | null>): string {
  return parts.filter(Boolean).join(' ');
}

// ---- Card ---------------------------------------------------------------------

export function Card({ id, data, lit, onSelect, arriveFrom, className, style }: PrimitiveProps<CardData>) {
  const isLit = lit?.includes(id) ?? false;
  const down = data.face === 'down';
  const handled = handledTransform(id, data.rotation ? 0 : 1);
  const lp = litProps(isLit, () => onSelect?.({ component: 'card', id, label: data.label }));
  const faceStyle: CSSProperties = { background: themeColor(data.colorKey ?? data.label) };
  return (
    <div
      data-flip-id={id}
      data-flip-from={arriveFrom}
      data-base-transform={handled}
      className={cx('zk-card', data.rotation ? `r${data.rotation}` : undefined, lp.className, className)}
      style={{ transform: handled, ...style }}
      title={down ? undefined : data.label}
      aria-label={down ? `${data.label || 'face-down card'}` : data.label}
      role={lp.role}
      tabIndex={lp.tabIndex}
      onClick={lp.onClick}
      onKeyDown={lp.onKeyDown}
    >
      <div className={cx('zk-card-flipper', down && 'down')}>
        <div className="zk-card-face" style={faceStyle}>
          {data.artUrl && <img className="zk-card-art" src={data.artUrl} alt="" />}
          <div>
            {data.cost !== undefined && <span className="zk-card-cost">{data.cost}</span>}
            <div className="zk-card-label">{data.label}</div>
            {data.subtitle && <div className="zk-card-sub">{data.subtitle}</div>}
          </div>
          <div>
            {data.badges && data.badges.length > 0 && (
              <div className="zk-card-badges">
                {data.badges.map((b, i) => <span key={i} className="zk-card-badge">{b}</span>)}
              </div>
            )}
            {data.count !== undefined && data.count > 1 && <div className="zk-card-count">×{data.count}</div>}
            {data.counts && data.counts.length > 0 && (
              <div className="zk-card-counts">
                {data.counts.map((c, i) => <span key={i} className={c.own ? 'own' : undefined}>{c.label} {c.value}</span>)}
              </div>
            )}
          </div>
        </div>
        <div className="zk-card-back">
          <div>{data.count !== undefined && data.count > 1 ? `×${data.count}` : ''}</div>
        </div>
      </div>
    </div>
  );
}

// ---- Card zone -------------------------------------------------------------------

/** A fan's cards by what they stack with, in first-seen order. Null when any
 *  card does not say — a hand only folds if the whole hand can. */
function groupsOf(cards: CardData[]): Array<[string, CardData[]]> | null {
  // A plain list of pairs: this module exports a `Map` component of its own,
  // which shadows the built-in one.
  const out: Array<[string, CardData[]]> = [];
  for (const c of cards) {
    if (!c.groupKey) return null;
    const found = out.find(([key]) => key === c.groupKey);
    if (found) found[1].push(c);
    else out.push([c.groupKey, [c]]);
  }
  return out;
}

/** The outlines after a zone's cards: the slots still to be filled. */
function emptySlots(id: string, count: number | undefined): ReactNode {
  if (!count || count <= 0) return null;
  return Array.from({ length: count }, (_, i) => (
    <span key={`${id}:empty:${i}`} className="zk-card-slot" aria-hidden="true" />
  ));
}

/**
 * How a fan of `n` cards sits, at the bench's card width.
 *
 * Up to seven nothing overlaps and every face is readable — the common case.
 * From eight the fan tightens, sliding cards under each other but never
 * leaving a strip narrower than a thumb. Past eleven, squeezing stops being
 * the answer: the strip is still tappable but carries nothing you can plan
 * with, so a hand whose cards say what they stack with folds into stacks
 * instead. (docs/design/Cybernoir Big Hands.dc.html)
 */
const FAN_FULL_UP_TO = 7;
const FAN_TIGHT_UP_TO = 11;
/** No exposed strip is ever narrower than a thumb. */
const THUMB_PX = 44;

export function fanOverlap(n: number, cardWidth: number): number {
  if (n <= FAN_FULL_UP_TO) return 0;
  const floor = Math.max(0, cardWidth - THUMB_PX);
  const wanted = 30 + (n - FAN_FULL_UP_TO) * 6;
  return Math.min(floor, wanted);
}

export function CardZone({ id, data, lit, onSelect, arriveFrom, className, style }: PrimitiveProps<CardZoneData>) {
  const isLit = lit?.includes(id) ?? false;
  const lp = litProps(isLit, () => onSelect?.({ component: 'card-zone', id, label: data.label ?? id }));
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [spread, setSpread] = useState(false);
  const cards = data.cards;
  // Spread lays the whole hand out at once, and is there as soon as the fan
  // starts overlapping — for the player who would rather see all of it.
  const showSpread = data.mode === 'fan' && (cards?.length ?? 0) > FAN_FULL_UP_TO;
  let body: ReactNode;
  if (cards === undefined) {
    const n = data.countOnly ?? 0;
    body = n > 0 ? (
      <div className="zk-zone-pile">
        <span className="zk-zone-depth">{n}</span>
        <Card id={`${id}:back`} data={{ label: '', face: 'down', count: n }} />
      </div>
    ) : <div className="zk-zone-empty">empty</div>;
  } else if (cards.length === 0) {
    body = data.empty
      ? <div className={data.mode === 'fan' ? 'zk-zone-fan' : 'zk-zone-row'}>{emptySlots(id, data.empty)}</div>
      : <div className="zk-zone-empty">empty</div>;
  } else if (data.mode === 'pile') {
    // Bottom to top; the top card is the visible one and flies as itself.
    const under = cards.slice(Math.max(0, cards.length - 3), cards.length - 1);
    const top = cards[cards.length - 1]!;
    body = (
      <div className="zk-zone-pile">
        <span className="zk-zone-depth">{cards.length}</span>
        {under.map((c, i) => (
          <Card key={c.id ?? `${id}:under:${i}`} id={c.id ?? `${id}:under:${i}`} data={c} style={{ top: (i - under.length) * 2, left: (i - under.length) * 1 }} />
        ))}
        <Card id={top.id ?? `${id}:top`} data={top} lit={lit} onSelect={onSelect} arriveFrom={arriveFrom} />
      </div>
    );
  } else {
    const card = (c: CardData, i: number, s?: CSSProperties) => (
      <Card key={c.id ?? `${id}:${i}`} id={c.id ?? `${id}:${i}`} data={c} lit={lit} onSelect={onSelect} arriveFrom={arriveFrom} style={s} />
    );
    const groups = data.mode === 'fan' && !spread ? groupsOf(cards) : null;
    if (groups && cards.length > FAN_TIGHT_UP_TO) {
      // Past eleven the hand folds into stacks. A stack holding a card the
      // engine is offering lights itself; opening it lights the card.
      body = (
        <div className="zk-zone-row">
          {groups.map(([key, members]) => {
            const open = openGroup === key;
            const holds = members.some((c) => c.id && lit?.includes(c.id));
            return (
              <div key={key} className={cx('zk-stack', open && 'open')}>
                <button
                  type="button"
                  className={cx('zk-stack-head', holds && 'zk-lit')}
                  aria-expanded={open}
                  onClick={() => setOpenGroup(open ? null : key)}
                >
                  <span className="zk-stack-name">{data.groupNames?.[key] ?? key}</span>
                  <span className="zk-stack-count">{members.length}</span>
                  <span className="zk-stack-who">{members.map((c) => c.label).join(', ')}</span>
                </button>
                {open && <div className="zk-zone-row zk-stack-open">{members.map((c, i) => card(c, i))}</div>}
              </div>
            );
          })}
        </div>
      );
    } else if (data.mode === 'fan' && !spread) {
      const overlap = fanOverlap(cards.length, 96);
      body = (
        <div className="zk-zone-fan">
          {cards.map((c, i) => card(c, i, i === 0 ? { marginLeft: 0 } : { marginLeft: -overlap }))}
          {emptySlots(id, data.empty)}
        </div>
      );
    } else {
      body = (
        <div className={data.mode === 'fan' ? 'zk-zone-row zk-zone-spread' : 'zk-zone-row'}>
          {cards.map((c, i) => card(c, i))}
          {emptySlots(id, data.empty)}
        </div>
      );
    }
  }
  return (
    <div
      data-flip-id={id}
      className={cx('zk-zone', data.size === 'small' && 'zk-zone-small', lp.className, className)}
      style={style}
      role={lp.role}
      tabIndex={lp.tabIndex}
      onClick={lp.onClick}
      onKeyDown={lp.onKeyDown}
    >
      {(data.label || showSpread) && (
        <div className="zk-zone-label">
          {data.label}
          {showSpread && (
            <button type="button" className="zk-spread" aria-pressed={spread} onClick={(e) => { e.stopPropagation(); setSpread(!spread); }}>
              {spread ? 'Fan' : 'Spread'}
            </button>
          )}
        </div>
      )}
      {body}
    </div>
  );
}

// ---- Tableau --------------------------------------------------------------------

export function Tableau({ id, data, className, style, children }: PrimitiveProps<TableauData> & { children?: ReactNode }) {
  const accent = data.owner ? themeColor(data.owner) : 'var(--border)';
  return (
    <section
      data-flip-id={id}
      className={cx('zk-tableau', data.active && 'active', className)}
      style={{ borderLeftColor: accent, ...style }}
      aria-label={data.label}
    >
      {(data.label || data.active) && (
        <div className="zk-tableau-title">
          {data.artUrl
            ? <img className="zk-portrait" src={data.artUrl} alt="" style={{ borderColor: accent }} />
            : data.owner && <span className="zk-swatch" style={{ background: accent }} />}
          <span>{data.label}</span>
          {data.active && <span className="zk-tableau-turn">{data.activeLabel ?? 'their turn'}</span>}
        </div>
      )}
      {(data.stats ?? []).map((s, i) => {
        const value = typeof s.value === 'number' ? s.value : Number(s.value);
        const pct = s.max && Number.isFinite(value) ? Math.max(0, Math.min(100, (value / s.max) * 100)) : null;
        return (
          <div key={i}>
            <div className="zk-stat"><span>{s.label}</span><b>{s.max ? `${s.value} / ${s.max}` : s.value}</b></div>
            {pct !== null && <div className="zk-meter"><div style={{ width: `${pct}%` }} /></div>}
          </div>
        );
      })}
      {children && <div className="zk-tableau-slot">{children}</div>}
    </section>
  );
}

// ---- Bag ------------------------------------------------------------------------

export function Bag({ id, data, lit, onSelect, className, style }: PrimitiveProps<BagData>) {
  const isLit = lit?.includes(id) ?? false;
  const lp = litProps(isLit, () => onSelect?.({ component: 'bag', id, label: data.label ?? id }));
  const total = data.count ?? data.contents?.reduce((n, c) => n + c.count, 0) ?? 0;
  return (
    <div data-flip-id={id} className={cx('zk-bag-wrap', className)} style={style}>
      <div>
        <div
          className={cx('zk-bag', lp.className)}
          style={{ background: data.owner ? themeColor(data.owner) : 'var(--brand-orange)' }}
          role={lp.role} tabIndex={lp.tabIndex} onClick={lp.onClick} onKeyDown={lp.onKeyDown}
          aria-label={`${data.label ?? 'bag'}: ${total}`}
        >
          {total}
        </div>
        {data.label && <div className="zk-zone-label" style={{ textAlign: 'center' }}>{data.label}</div>}
        {data.status && <div className={cx('zk-bag-status', data.status)}>{data.status}</div>}
      </div>
      {data.contents && data.contents.length > 0 && (
        <div className="zk-chips">
          {data.contents.map((c) => (
            <span key={c.label} className="zk-chip">
              <span className="zk-swatch" style={{ background: themeColor(c.colorKey ?? c.label) }} />
              {c.label} ×{c.count}
            </span>
          ))}
        </div>
      )}
      {data.revealRow && data.revealRow.length > 0 && (
        <div className="zk-zone-row">
          {data.revealRow.map((c, i) => (
            <Card key={c.id ?? `${id}:pulled:${i}`} id={c.id ?? `${id}:pulled:${i}`} data={c} arriveFrom={id} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Track ----------------------------------------------------------------------

export function Track({ id, data, lit, onSelect, className, style }: PrimitiveProps<TrackData>) {
  const markersAt = (index: number | string) => (data.markers ?? []).filter((m) => String(m.at) === String(index));
  return (
    <div data-flip-id={id} className={className} style={style}>
      {data.label && <div className="zk-zone-label">{data.label}</div>}
      <div className={cx('zk-track', data.pieceShape === 'named' && 'named')}>
        {data.spaces.map((s, si) => {
          const spaceId = `${id}:${s.index}`;
          const isLit = lit?.includes(spaceId) ?? false;
          const lp = litProps(isLit, () => onSelect?.({ component: 'track', id: spaceId, label: s.label ?? String(s.index) }));
          const named = data.pieceShape === 'named';
          if (named) {
            // A space that holds a stack of face-up cards: who is standing on
            // it is the point, so they are named rather than drawn as dots.
            return (
              <div key={String(s.index)} className="zk-track-slot-wrap">
                {data.arrows && si > 0 && <span className="zk-track-arrow" aria-hidden="true">→</span>}
                <div className={cx('zk-track-slot', (s.pieces?.length ?? 0) > 0 && 'filled')}>
                  <div className="zk-track-slot-name">{s.index}</div>
                  {(s.pieces ?? []).length > 0
                    ? (s.pieces ?? []).map((p) => (
                      <span key={p.label} className="zk-track-card" data-flip-id={`${id}:piece:${p.label}`}
                        style={{ borderLeftColor: themeColor(p.colorKey ?? p.label) }}>{p.label}</span>
                    ))
                    : <span className="zk-track-slot-empty">{s.label ?? 'empty'}</span>}
                </div>
              </div>
            );
          }
          return (
            <div key={String(s.index)} className={cx('zk-track-space', s.filled && 'filled')}>
              {markersAt(s.index).map((m) => (
                <div key={m.label} className="zk-track-marker" data-flip-id={`${id}:marker:${m.label}`} style={{ color: themeColor(m.colorKey ?? m.label) }}>
                  {m.label}
                </div>
              ))}
              {s.pieces && s.pieces.length > 0 && (
                <div className="zk-track-pieces">
                  {s.pieces.map((p) => (
                    <span key={p.label} className="zk-pawn" data-flip-id={`${id}:piece:${p.label}`} title={p.label}
                      style={{ background: themeColor(p.colorKey ?? p.label) }} />
                  ))}
                </div>
              )}
              <div
                className={cx('zk-track-cell', lp.className)}
                role={lp.role} tabIndex={lp.tabIndex} onClick={lp.onClick} onKeyDown={lp.onKeyDown}
                aria-label={s.label ?? String(s.index)}
              >
                {s.label ?? ''}
              </div>
              <div className="zk-track-idx">{s.index}</div>
            </div>
          );
        })}
        {data.cyclic && <div className="zk-track-loop">↻</div>}
      </div>
    </div>
  );
}

// ---- Pool ------------------------------------------------------------------------

const MAX_TOKENS_DRAWN = 12;

// A pool of one-offs — named things that are each on the table once, like
// Cybernoir's ruled-out clue tokens — reads as names, so a count of one is
// left off. Same rule the card already uses for its own count.


export function Pool({ id, data, lit, onSelect, className, style }: PrimitiveProps<PoolData>) {
  return (
    <div data-flip-id={id} className={cx('zk-pool', className)} style={style}>
      {data.label && <div className="zk-zone-label">{data.label}</div>}
      <div className="zk-pool-items">
        {data.items.map((it) => {
          const itemId = `${id}:${it.label}`;
          const isLit = lit?.includes(itemId) ?? false;
          const lp = litProps(isLit, () => onSelect?.({ component: 'pool', id: itemId, label: it.label }));
          const drawn = Math.min(MAX_TOKENS_DRAWN, Math.max(0, it.count));
          return (
            <span key={it.label} className={cx('zk-pool-item', lp.className)}
              role={lp.role} tabIndex={lp.tabIndex} onClick={lp.onClick} onKeyDown={lp.onKeyDown}
              aria-label={`${it.label}: ${it.count}`}>
              <span className="zk-pool-tokens">
                {Array.from({ length: drawn }, (_, i) => (
                  <span key={i} className="zk-token" data-flip-id={`${itemId}:token:${i}`}
                    style={{ background: themeColor(it.colorKey ?? it.label) }} />
                ))}
              </span>
              {it.label}{it.count > 1 && <> <b>×{it.count}</b></>}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ---- Grid -------------------------------------------------------------------------

export function Grid({ id, data, lit, onSelect, className, style }: PrimitiveProps<GridData>) {
  const cells = data.cells;
  let ext = data.extent;
  if (!ext) {
    const xs = cells.map((c) => c.x);
    const ys = cells.map((c) => c.y);
    ext = { minX: Math.min(0, ...xs), minY: Math.min(0, ...ys), maxX: Math.max(0, ...xs), maxY: Math.max(0, ...ys) };
  }
  const byKey = new globalThis.Map<string, GridData['cells'][number]>();
  for (const c of cells) byKey.set(`${c.x},${c.y}`, c);
  const cols = ext.maxX - ext.minX + 1;
  const rows = ext.maxY - ext.minY + 1;
  const out: ReactNode[] = [];
  for (let y = ext.minY; y <= ext.maxY; y++) {
    for (let x = ext.minX; x <= ext.maxX; x++) {
      const cell = byKey.get(`${x},${y}`);
      const cellId = `${id}:${x},${y}`;
      const isLit = lit?.includes(cellId) ?? false;
      const lp = litProps(isLit, () => onSelect?.({ component: 'grid', id: cellId, label: `${x},${y}` }));
      out.push(
        <div key={cellId} className={cx('zk-grid-cell', lp.className)}
          style={cell?.terrain ? { background: themeColor(cell.terrain) } : undefined}
          role={lp.role} tabIndex={lp.tabIndex} onClick={lp.onClick} onKeyDown={lp.onKeyDown}
          aria-label={`cell ${x},${y}`}>
          {data.coordinates && <span className="zk-ruler">{x},{y}</span>}
          {(cell?.pieces ?? []).map((p) => (
            <span key={p.label} className="zk-piece" data-flip-id={`${id}:piece:${p.label}`}
              style={{ background: themeColor(p.colorKey ?? p.label) }} title={p.label}>
              {p.label.slice(0, 2)}
              {p.badges && p.badges.length > 0 && <sup style={{ fontSize: 7 }}>{p.badges.join('')}</sup>}
            </span>
          ))}
        </div>,
      );
    }
  }
  return (
    <div data-flip-id={id} className={className} style={style}>
      {data.label && <div className="zk-zone-label">{data.label}</div>}
      <div className="zk-grid" style={{ gridTemplateColumns: `repeat(${cols}, var(--zekel-cell, 36px))`, gridTemplateRows: `repeat(${rows}, var(--zekel-cell, 36px))` }}>
        {out}
      </div>
    </div>
  );
}

// ---- Map --------------------------------------------------------------------------

export function Map({ id, data, lit, onSelect, className, style }: PrimitiveProps<MapData>) {
  const aspect = data.aspect ?? 62;
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  const byId = new globalThis.Map(data.nodes.map((n) => [n.id, n] as const));
  const roads: ReactNode[] = [];
  if (size.w > 0) {
    const seen = new Set<string>();
    for (const n of data.nodes) {
      for (const to of n.roadsTo ?? []) {
        const t = byId.get(to);
        if (!t) continue;
        const key = [n.id, to].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        const x1 = (n.x / 100) * size.w, y1 = (n.y / 100) * size.h;
        const x2 = (t.x / 100) * size.w, y2 = (t.y / 100) * size.h;
        const len = Math.hypot(x2 - x1, y2 - y1);
        const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
        roads.push(<div key={key} className="zk-map-road" style={{ left: x1, top: y1, width: len, transform: `rotate(${angle}deg)` }} />);
      }
    }
  }
  return (
    <div data-flip-id={id} className={className} style={style}>
      {data.label && <div className="zk-zone-label">{data.label}</div>}
      <div ref={ref} className="zk-map" style={{ paddingTop: `${aspect}%` }}>
        {(data.areas ?? []).map((a) => (
          <div
            key={a.key}
            className="zk-map-area"
            style={{ top: `${a.y}%`, height: `${a.height}%`, ...(a.colorKey ? { borderColor: themeColor(a.colorKey) } : {}) }}
          >
            <span className="zk-map-area-name">{a.label}</span>
            {a.note && <span className="zk-map-area-note">{a.note}</span>}
          </div>
        ))}
        {roads}
        {data.nodes.map((n) => {
          const isLit = lit?.includes(n.id) ?? false;
          const fire = () => onSelect?.({ component: 'map', id: n.id, label: n.label });
          // Lit means "a move is behind this". Inspectable means "you may look
          // at it": the same tap, and the table decides there is nothing to do
          // but show you what it is.
          const lp: LitProps = isLit || data.inspectable
            ? { ...litProps(true, fire), className: isLit ? 'zk-lit' : 'zk-look' }
            : {};
          const pill = data.nodeShape === 'pill';
          const px = 34 * (n.size ?? 1);
          // A pill is a place, wide enough to hold its own name; a dot is a
          // space on a board with many of them.
          const blob = pill
            ? { minWidth: px * 2.4, height: px * 0.82, background: themeColor(n.colorKey ?? n.label) }
            : { width: px, height: px, background: themeColor(n.colorKey ?? n.label) };
          return (
            <div key={n.id} className={cx('zk-map-node', pill && 'pill', n.dim && 'dim')} style={{ left: `${n.x}%`, top: `${n.y}%` }}>
              <div
                className={cx('zk-map-blob', pill && 'pill', lp.className)}
                style={blob}
                role={lp.role} tabIndex={lp.tabIndex} onClick={lp.onClick} onKeyDown={lp.onKeyDown}
                aria-label={n.describedAs ?? n.label}
                title={pill ? (n.describedAs ?? n.label) : undefined}
              >
                {pill && <span className="zk-map-blob-name">{n.label}</span>}
                {n.artUrl && <img className="zk-map-art" src={n.artUrl} alt="" />}
                {(n.pieces ?? []).map((p) => (
                  <span key={p.label} className="zk-piece" data-flip-id={`${id}:piece:${p.label}`}
                    style={{ width: 16, height: 16, background: themeColor(p.colorKey ?? p.label), fontSize: 8 }} title={p.label}>
                    {p.count && p.count > 1 ? p.count : p.label.slice(0, 1)}
                  </span>
                ))}
              </div>
              {!pill && <div className="zk-map-name">{n.label}</div>}
              {n.badges && n.badges.length > 0 && (
                <div className="zk-map-badges">{n.badges.map((b, i) => <span key={i} className="zk-card-badge" style={{ color: 'var(--fg)', background: 'var(--border)' }}>{b}</span>)}</div>
              )}
            </div>
          );
        })}
      </div>
      {data.legend && data.legend.length > 0 && (
        <div className="zk-map-legend" aria-label="What the colours mean">
          {data.legend.map((k) => (
            <span key={k.colorKey} className="zk-map-key">
              <span className="zk-map-key-dot" style={{ background: themeColor(k.colorKey) }} />
              {k.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Die ----------------------------------------------------------------------------

const PIPS: Record<number, number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};

/** One die. `rollKey` changes when a new roll lands, replaying the tumble. */
export function Die({ value, rollKey, label }: { value: number; rollKey?: string | number; label?: string }) {
  const [rolling, setRolling] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setRolling(true);
    const t = setTimeout(() => setRolling(false), 700);
    return () => clearTimeout(t);
  }, [rollKey]);
  const pips = PIPS[Math.max(1, Math.min(6, Math.round(value)))] ?? [];
  return (
    <div className={cx('zk-die', rolling && 'rolling')} aria-label={`${label ?? 'die'}: ${value}`} title={String(value)}>
      {Array.from({ length: 9 }, (_, i) => <span key={i} className={cx('zk-pip', pips.includes(i) && 'on')} />)}
    </div>
  );
}
