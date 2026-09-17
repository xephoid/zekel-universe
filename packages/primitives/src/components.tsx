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

function litProps(isLit: boolean, fire: () => void) {
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

export function CardZone({ id, data, lit, onSelect, arriveFrom, className, style }: PrimitiveProps<CardZoneData>) {
  const isLit = lit?.includes(id) ?? false;
  const lp = litProps(isLit, () => onSelect?.({ component: 'card-zone', id, label: data.label ?? id }));
  const cards = data.cards;
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
    body = <div className="zk-zone-empty">empty</div>;
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
    body = (
      <div className={data.mode === 'fan' ? 'zk-zone-fan' : 'zk-zone-row'}>
        {cards.map((c, i) => (
          <Card key={c.id ?? `${id}:${i}`} id={c.id ?? `${id}:${i}`} data={c} lit={lit} onSelect={onSelect} arriveFrom={arriveFrom} />
        ))}
      </div>
    );
  }
  return (
    <div
      data-flip-id={id}
      className={cx('zk-zone', lp.className, className)}
      style={style}
      role={lp.role}
      tabIndex={lp.tabIndex}
      onClick={lp.onClick}
      onKeyDown={lp.onKeyDown}
    >
      {data.label && <div className="zk-zone-label">{data.label}</div>}
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
      <div className="zk-track">
        {data.spaces.map((s) => {
          const spaceId = `${id}:${s.index}`;
          const isLit = lit?.includes(spaceId) ?? false;
          const lp = litProps(isLit, () => onSelect?.({ component: 'track', id: spaceId, label: s.label ?? String(s.index) }));
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
              {it.label} <b>×{it.count}</b>
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
        {roads}
        {data.nodes.map((n) => {
          const isLit = lit?.includes(n.id) ?? false;
          const lp = litProps(isLit, () => onSelect?.({ component: 'map', id: n.id, label: n.label }));
          const px = 34 * (n.size ?? 1);
          return (
            <div key={n.id} className="zk-map-node" style={{ left: `${n.x}%`, top: `${n.y}%` }}>
              <div
                className={cx('zk-map-blob', lp.className)}
                style={{ width: px, height: px, background: themeColor(n.colorKey ?? n.label) }}
                role={lp.role} tabIndex={lp.tabIndex} onClick={lp.onClick} onKeyDown={lp.onKeyDown}
                aria-label={n.label}
              >
                {n.artUrl && <img className="zk-map-art" src={n.artUrl} alt="" />}
                {(n.pieces ?? []).map((p) => (
                  <span key={p.label} className="zk-piece" data-flip-id={`${id}:piece:${p.label}`}
                    style={{ width: 16, height: 16, background: themeColor(p.colorKey ?? p.label), fontSize: 8 }} title={p.label}>
                    {p.count && p.count > 1 ? p.count : p.label.slice(0, 1)}
                  </span>
                ))}
              </div>
              <div className="zk-map-name">{n.label}</div>
              {n.badges && n.badges.length > 0 && (
                <div className="zk-map-badges">{n.badges.map((b, i) => <span key={i} className="zk-card-badge" style={{ color: 'var(--fg)', background: 'var(--border)' }}>{b}</span>)}</div>
              )}
            </div>
          );
        })}
      </div>
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
