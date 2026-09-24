// The map. One map for every seat: the same inks, shapes, labels and
// positions. A seat owns only the frame around it, its selection and reach
// marks, and what the current decision lights.
//
// Engine coords are "c,r" in doubled rows (neighbours at (c, r±2) and
// (c±1, r±1)); flat-topped hexes, laid out as the canvas's Table board does.
// Every token carries a stable data-flip-id, so a unit that moves slides from
// its old hex to its new one and a new piece flies in from its owner's
// supply: nothing appears in place.

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import type { NggPiece, NggTile, NggView, Species } from './read';
import { TERRAIN, inkOfSeat } from './factions';
import { Icon, Token } from './ui';

const HEXW = 104;
const HEXH = 90;
const COLW = 78;
const ROWH = 45;
const GUTTER = 26;
/** How many pieces a hex shows one by one before an army becomes a count. */
const BUDGET = 6;

export interface MapProposal {
  coord: string;
  owner: string;
  kind: 'collector' | 'unit' | 'hero' | 'base';
  /** the icon name (unit/collector) or the hero's name */
  name: string;
  key: string;
}

export interface MapMarks {
  /** tiles this decision can take: cream rim, brighter tile, pressable */
  lit?: ReadonlySet<string>;
  /** tiles you might expect to take but cannot, each with the engine's reason */
  shut?: ReadonlyMap<string, string>;
  /** grey every tile that is not lit, shut or marked (not part of this choice) */
  greyRest?: boolean;
  /** where the decision starts from (an army's origin): ink rim */
  origin?: string | null;
  /** a battle: danger rim */
  contested?: string | null;
  /** the seat's own mark on a chosen tile */
  selected?: string | null;
  /** pieces not on the board yet, drawn dashed where they would go */
  proposals?: MapProposal[];
  /** a short tag on a tile: FROM, BATTLE, BASE */
  tags?: ReadonlyMap<string, string>;
  /** called with a lit tile's coord */
  onTile?: (coord: string) => void;
}

function piecesOf(v: NggView, t: NggTile) {
  const heroes = t.pieces.filter((p) => p.kind === 'hero');
  const units = t.pieces.filter((p) => p.kind === 'unit');
  const collector = t.pieces.find((p) => p.kind === 'collector') ?? null;
  const speciesOf = (pid: string): Species | null => v.players.find((p) => p.id === pid)?.species ?? null;
  return { heroes, units, collector, speciesOf };
}

function collectorIcon(species: Species | null, resource: string | null): string {
  if (species === 'wizard') return 'Surf';
  const r = resource ? TERRAIN[resource]?.name : null;
  return r ? `${r} collector` : 'Collector';
}

function TilePieces({ v, t, proposals }: { v: NggView; t: NggTile; proposals: MapProposal[] }) {
  const { heroes, units, collector, speciesOf } = piecesOf(v, t);
  const factionOf = (pid: string) => v.players.find((p) => p.id === pid)?.faction ?? null;
  const crowded = heroes.length + units.length > BUDGET;
  const armies = new Map<string, NggPiece[]>();
  for (const u of units) armies.set(u.owner, [...(armies.get(u.owner) ?? []), u]);
  const baseFaction = t.baseOwner ? factionOf(t.baseOwner) : null;
  const dashedCollector = proposals.find((p) => p.kind === 'collector');
  return (
    <div className="ngg-tile-pieces">
      <div className="ngg-tile-army">
        {t.baseOwner && (
          <span data-flip-id={`ngg-base:${t.coord}`} data-flip-from={`ngg-supply:${t.baseOwner}`}>
            <Token kind="base" faction={baseFaction} name="Base" size={20} title={`${baseFaction ?? ''} base`} />
          </span>
        )}
        {heroes.map((h) => (
          <span key={h.name} data-flip-id={`ngg-hero:${h.name}`} data-flip-from={`ngg-supply:${h.owner}`}>
            <Token kind="hero" faction={factionOf(h.owner)} name={h.name} leader={h.leader} size={22} title={`${h.name}${h.stats ? ` · ${h.stats}` : ''}`} />
          </span>
        ))}
        {crowded
          ? [...armies.entries()].map(([owner, list]) => {
              const ink = inkOfSeat(v, owner);
              return (
                <span key={owner} className="ngg-army-chip" style={{ background: ink.fill, color: ink.on }} title={list.map((u) => u.name).join(', ')}>
                  {list.length}
                </span>
              );
            })
          : units.map((u) => (
              <span key={u.id ?? u.name} data-flip-id={`ngg-unit:${u.id ?? u.name}`} data-flip-from={`ngg-supply:${u.owner}`}>
                <Token kind="unit" faction={factionOf(u.owner)} name={u.name} size={22} title={`${u.name}${u.core === 'CORELESS' ? ' · no Core' : ''}`} />
              </span>
            ))}
        {proposals.filter((p) => p.kind !== 'collector').map((p) => (
          <Token key={p.key} kind={p.kind} faction={factionOf(p.owner)} name={p.name} state="dashed" size={22} />
        ))}
      </div>
      {collector && (
        <span className="ngg-tile-collector" data-flip-id={`ngg-collector:${collector.id}`} data-flip-from={`ngg-supply:${collector.owner}`}>
          <Token kind="collector" faction={factionOf(collector.owner)} name={collectorIcon(speciesOf(collector.owner), collector.resource)} size={18} title={collector.name} />
        </span>
      )}
      {!collector && dashedCollector && (
        <span className="ngg-tile-collector">
          <Token kind="collector" faction={factionOf(dashedCollector.owner)} name={dashedCollector.name} state="dashed" size={18} />
        </span>
      )}
    </div>
  );
}

/** The scale that fits the whole map in its box, at every size. */
function useFit(w: number, h: number) {
  const box = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      setFit(Math.max(0.3, Math.min(r.width / w, r.height / h, 1.6)));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w, h]);
  return { box, fit };
}

/** Three fixed stops (the canvas's Map Zoom): the whole map, the board at
 *  its own size, and one hex close up. No free zoom. */
export type ZoomStop = 'whole' | 'board' | 'hex';
const ZOOM_STOPS: Array<{ stop: ZoomStop; label: string }> = [
  { stop: 'whole', label: 'Whole map' }, { stop: 'board', label: 'Board' }, { stop: 'hex', label: 'Hex' },
];

function ZoomControl({ zoom, setZoom }: { zoom: ZoomStop; setZoom: (z: ZoomStop) => void }) {
  return (
    <div className="ngg-zoom" role="group" aria-label="Map zoom">
      {ZOOM_STOPS.map((z) => (
        <button key={z.stop} type="button" className={zoom === z.stop ? 'on' : ''} aria-pressed={zoom === z.stop} onClick={() => setZoom(z.stop)}>
          <i className={`ngg-zoom-hex ${z.stop}`} aria-hidden="true" />{z.label}
        </button>
      ))}
    </div>
  );
}

export function HexMap({ v, marks = {}, seatSpecies, overlay }: {
  v: NggView;
  marks?: MapMarks;
  /** the viewing seat's species: its selection mark is inked or machined */
  seatSpecies?: Species | null;
  /** floating panels over the board (the action stack, pills) */
  overlay?: ReactNode;
}) {
  const cs = v.tiles.map((t) => t.c);
  const rs = v.tiles.map((t) => t.r);
  const cMin = cs.length ? Math.min(...cs) : 0;
  const cMax = cs.length ? Math.max(...cs) : 0;
  const rMin = rs.length ? Math.min(...rs) : 0;
  const rMax = rs.length ? Math.max(...rs) : 0;
  const mapW = (cMax - cMin) * COLW + HEXW + GUTTER;
  const mapH = (rMax - rMin) * ROWH + HEXH + GUTTER;
  const { box, fit } = useFit(mapW + 24, mapH + 24);
  const [zoom, setZoom] = useState<ZoomStop>('whole');
  // Board is the map at its own size and Hex twice that, never smaller than the whole map.
  const scale = zoom === 'whole' ? fit : Math.max(fit, zoom === 'board' ? 1 : 2);
  const panned = scale > fit + 0.001;
  const scroller = useRef<HTMLDivElement>(null);
  // A new stop keeps what was in the middle in the middle, or starts centred.
  const lastScale = useRef(scale);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ratio = scale / lastScale.current;
    lastScale.current = scale;
    const cx = (el.scrollLeft + el.clientWidth / 2) * ratio;
    const cy = (el.scrollTop + el.clientHeight / 2) * ratio;
    el.scrollLeft = Math.max(0, cx - el.clientWidth / 2);
    el.scrollTop = Math.max(0, cy - el.clientHeight / 2);
  }, [scale]);
  // Drag to pan when zoomed in; a click on a hex is still a click.
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const el = scroller.current;
    if (!panned || !el || e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, moved: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = scroller.current;
    const d = drag.current;
    if (!el || !d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
    d.moved = true;
    el.scrollLeft = d.left - dx;
    el.scrollTop = d.top - dy;
  };
  const endDrag = () => { setTimeout(() => { drag.current = null; }, 0); };
  const onClickCapture = (e: React.MouseEvent) => { if (drag.current?.moved) { e.stopPropagation(); e.preventDefault(); } };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const order: ZoomStop[] = ['whole', 'board', 'hex'];
    const i = order.indexOf(zoom);
    if (e.key === '+' || e.key === '=') setZoom(order[Math.min(2, i + 1)]!);
    else if (e.key === '-') setZoom(order[Math.max(0, i - 1)]!);
    else if (e.key === '0') setZoom('whole');
    else return;
    e.preventDefault();
  };
  const x = (c: number) => GUTTER + (c - cMin) * COLW;
  const y = (r: number) => GUTTER + (r - rMin) * ROWH;

  const columns = [...new Set(cs)].sort((a, b) => a - b);
  const letterOf = (c: number) => v.tiles.find((t) => t.c === c)?.label.replace(/\d+$/, '') ?? '';

  return (
    <div className="ngg-map-box" ref={box}>
      <div
        className={`ngg-map-scroll${panned ? ' panned' : ''}`}
        ref={scroller}
        tabIndex={0}
        aria-label="The map. Plus and minus change the zoom; zero shows the whole map."
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onClickCapture={onClickCapture}
      >
      <div className="ngg-map-canvas" style={panned ? { width: mapW * scale + 48, height: mapH * scale + 48 } : undefined}>
      <div className="ngg-map" style={panned
        ? { width: mapW, height: mapH, left: 24, top: 24, transform: `scale(${scale})`, transformOrigin: 'top left' }
        : { width: mapW, height: mapH, transform: `translate(-50%, -50%) scale(${scale})` }}>
        {columns.map((c) => (
          <span key={`col${c}`} className="ngg-map-col" style={{ left: x(c) + HEXW / 2 }}>{letterOf(c)}</span>
        ))}
        {v.tiles.map((t) => {
          const lit = marks.lit?.has(t.coord) ?? false;
          const shut = marks.shut?.get(t.coord) ?? null;
          const isOrigin = marks.origin === t.coord;
          const contested = marks.contested === t.coord;
          const grey = !!marks.greyRest && !lit && !shut && !isOrigin && !contested;
          const terrain = t.resource ? TERRAIN[t.resource] : null;
          const cls = `ngg-hex${lit ? ' lit' : ''}${shut ? ' shut' : ''}${grey ? ' grey' : ''}${isOrigin ? ' origin' : ''}${contested ? ' contested' : ''}`;
          const tag = marks.tags?.get(t.coord);
          const proposals = (marks.proposals ?? []).filter((p) => p.coord === t.coord);
          const style = { left: x(t.c), top: y(t.r) };
          const title = [t.label, terrain?.name, shut].filter(Boolean).join(' · ');
          const inner = (
            <>
              <span className="ngg-hex-rim" aria-hidden="true" />
              <span className="ngg-hex-face" style={{ background: terrain?.tile ?? '#8d8577' }}>
                <span className="ngg-hex-code">{t.label}</span>
                {terrain && <span className="ngg-hex-glyph"><Icon name={terrain.icon} size={13} stroke={2.2} /></span>}
                {t.start !== null && !t.baseOwner && <span className="ngg-hex-start">{t.start}</span>}
                {shut && <span className="ngg-hex-bar" aria-hidden="true" />}
              </span>
              <TilePieces v={v} t={t} proposals={proposals} />
              {marks.selected === t.coord && <SeatMark species={seatSpecies ?? null} />}
              {tag && <span className="ngg-hex-tag">{tag}</span>}
            </>
          );
          return lit && marks.onTile
            ? <button key={t.coord} type="button" className={cls} style={style} title={title} aria-label={title} onClick={() => marks.onTile!(t.coord)}>{inner}</button>
            : <div key={t.coord} className={cls} style={style} title={title}>{inner}</div>;
        })}
      </div>
      </div>
      </div>
      {overlay}
      <ZoomControl zoom={zoom} setZoom={setZoom} />
    </div>
  );
}

/** The seat's own selection mark: a drawn ring for a wizard, corner brackets for a robot. */
function SeatMark({ species }: { species: Species | null }) {
  if (species === 'robot') {
    return <span className="ngg-seatmark robot" aria-hidden="true"><i /><i /><i /><i /></span>;
  }
  return (
    <svg className="ngg-seatmark wizard" viewBox="0 0 104 90" aria-hidden="true">
      <path d="M27 4 Q 51 1.4, 76 4.6 Q 101 43, 76 86 Q 51 88.6, 27 85.8 Q 2 44, 27 4 Z" />
    </svg>
  );
}
