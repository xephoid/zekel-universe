import type { ReactNode } from 'react';
import { useFlip } from './useFlip.js';
import { baseCardStyle, litStyle, paletteColor } from './styles.js';
import type {
  CardData, CardZoneData, TableauData, BagData, TrackData, PoolData,
  GridData, MapData, SelectEvent,
} from './types.js';

export interface PrimitiveProps<T> {
  data: T;
  previous?: T;
  lit?: string[]; // ids of selectable parts
  palette?: Record<string, string>; // color key → css color, supplied by the game
  onSelect?: (e: SelectEvent) => void;
}

export function Card({ data, lit, palette, onSelect }: PrimitiveProps<CardData>) {
  const isLit = lit?.includes(data.id) ?? false;
  const style = {
    ...baseCardStyle,
    borderColor: paletteColor(data.colorKey, palette),
    ...(isLit ? litStyle : {}),
    minWidth: 64,
  };
  return (
    <div
      data-flip-id={data.id}
      style={style}
      role={isLit ? 'button' : undefined}
      tabIndex={isLit ? 0 : undefined}
      onClick={() => isLit && onSelect?.({ component: 'card', id: data.id, label: data.title })}
    >
      {data.faceDown ? (
        <div style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-muted)' }}>
          {data.count != null ? `×${data.count}` : 'card'}
        </div>
      ) : (
        <>
          <div style={{ fontFamily: 'var(--font-display)' }}>{data.title}</div>
          {data.subtitle && <div style={{ color: 'var(--fg-muted)', fontSize: 12 }}>{data.subtitle}</div>}
        </>
      )}
    </div>
  );
}

export function CardZone({ data, lit, palette, onSelect }: PrimitiveProps<CardZoneData>) {
  const flipRef = useFlip([data]);
  const isLit = lit?.includes(data.id) ?? false;
  return (
    <div
      data-flip-id={data.id}
      onClick={() => isLit && onSelect?.({ component: 'card-zone', id: data.id, label: data.label ?? data.id })}
      style={{
        padding: 8,
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-raised)',
        border: '1px dashed var(--border)',
        ...(isLit ? litStyle : {}),
      }}
    >
      {data.label && <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 6 }}>{data.label}</div>}
      <div
        ref={flipRef}
        style={{
          display: 'flex',
          flexDirection: data.kind === 'fan' || data.kind === 'row' ? 'row' : 'column',
          gap: data.kind === 'fan' ? -20 : 6,
          flexWrap: 'wrap',
        }}
      >
        {data.cards.map((c) => (
          <Card key={c.id} data={c} lit={lit} palette={palette} onSelect={onSelect} />
        ))}
        {data.cards.length === 0 && <div style={{ color: 'var(--fg-muted)', fontSize: 12 }}>empty</div>}
      </div>
    </div>
  );
}

export function Tableau({ data, lit, palette, onSelect }: PrimitiveProps<TableauData>) {
  return (
    <section
      data-flip-id={data.id}
      style={{
        border: '2px solid',
        borderColor: paletteColor(data.colorKey, palette),
        borderRadius: 'var(--radius-lg)',
        padding: 10,
        display: 'flex',
        gap: 10,
        flexWrap: 'wrap',
        background: 'var(--card)',
      }}
    >
      {data.label && <div style={{ width: '100%', fontFamily: 'var(--font-display)' }}>{data.label}</div>}
      {data.zones.map((z) => (
        <CardZone key={z.id} data={z} lit={lit} palette={palette} onSelect={onSelect} />
      ))}
    </section>
  );
}

export function Bag({ data, onSelect, lit }: PrimitiveProps<BagData>) {
  const isLit = lit?.includes(data.id) ?? false;
  return (
    <div
      data-flip-id={data.id}
      style={{
        width: 72, height: 72, borderRadius: '50%',
        background: 'var(--card)', border: '2px solid var(--border)',
        display: 'grid', placeItems: 'center', textAlign: 'center',
        ...(isLit ? litStyle : {}),
      }}
      onClick={() => isLit && onSelect?.({ component: 'bag', id: data.id, label: data.label ?? data.id })}
    >
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>{data.count}</div>
        {data.label && <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{data.label}</div>}
      </div>
    </div>
  );
}

export function Track({ data, palette }: PrimitiveProps<TrackData>) {
  const cells: ReactNode[] = [];
  for (let i = 0; i < data.length; i++) {
    const markersHere = Object.entries(data.markers).filter(([, pos]) => pos === i);
    cells.push(
      <div
        key={i}
        style={{
          width: 28, height: 28, borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
          background: 'var(--bg-raised)',
          display: 'grid', placeItems: 'center', fontSize: 11,
        }}
      >
        {markersHere.map(([m]) => (
          <span key={m} data-flip-id={`${data.id}:${m}`} style={{ color: paletteColor(m, palette) }} aria-label={m}>●</span>
        ))}
      </div>,
    );
  }
  return (
    <div data-flip-id={data.id}>
      {data.label && <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 4 }}>{data.label}</div>}
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>{cells}</div>
    </div>
  );
}

export function Pool({ data, palette }: PrimitiveProps<PoolData>) {
  return (
    <div data-flip-id={data.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {data.label && <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{data.label}</span>}
      {Object.entries(data.tokens).map(([key, count]) => (
        <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            width: 16, height: 16, borderRadius: '50%',
            background: paletteColor(key, palette), border: '1px solid var(--border)',
            display: 'inline-block',
          }} />
          <span style={{ fontSize: 13 }}>{count}</span>
        </span>
      ))}
    </div>
  );
}

export function Grid({ data, lit, onSelect }: PrimitiveProps<GridData>) {
  // NOTE: the Map component below shadows the global Map constructor in this
  // file, so the grid index uses a plain object.
  const cellMap: Record<string, GridData['cells'][number]> = {};
  for (const c of data.cells) cellMap[`${c.x},${c.y}`] = c;
  return (
    <div
      data-flip-id={data.id}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${data.width}, 36px)`,
        gap: 2,
      }}
    >
      {Array.from({ length: data.height * data.width }, (_, i) => {
        const x = i % data.width;
        const y = Math.floor(i / data.width);
        const cell = cellMap[`${x},${y}`];
        const cellId = cell ? `${data.id}:${x},${y}` : '';
        const isLit = cell && lit?.includes(cellId);
        return (
          <div
            key={i}
            style={{
              width: 36, height: 36, border: '1px solid var(--border)',
              background: 'var(--bg-raised)', fontSize: 10,
              display: 'grid', placeItems: 'center',
              ...(isLit ? litStyle : {}),
            }}
            onClick={() => isLit && onSelect?.({ component: 'grid', id: cellId, label: cell.label ?? cellId })}
          >
            {cell?.occupant ?? cell?.label ?? ''}
          </div>
        );
      })}
    </div>
  );
}

export function Map({ data, lit, palette, onSelect }: PrimitiveProps<MapData>) {
  const W = 640, H = 400;
  return (
    <div data-flip-id={data.id} style={{ position: 'relative', width: W, height: H, background: 'var(--bg-raised)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {data.regions.flatMap((r) =>
          (r.roadsTo ?? []).map((toId) => {
            const to = data.regions.find((x) => x.id === toId);
            if (!to) return null;
            return (
              <line key={`${r.id}-${toId}`}
                x1={(r.x / 100) * W} y1={(r.y / 100) * H}
                x2={(to.x / 100) * W} y2={(to.y / 100) * H}
                stroke="var(--border)" strokeWidth={2} strokeDasharray="4 4" />
            );
          }),
        )}
      </svg>
      {data.regions.map((r) => {
        const isLit = lit?.includes(r.id) ?? false;
        return (
          <button
            key={r.id}
            data-flip-id={`region:${r.id}`}
            onClick={() => isLit && onSelect?.({ component: 'map', id: r.id, label: r.label })}
            style={{
              position: 'absolute',
              left: `${r.x}%`, top: `${r.y}%`,
              transform: 'translate(-50%, -50%)',
              borderRadius: 'var(--radius-round)',
              border: '2px solid',
              borderColor: paletteColor(r.colorKey, palette),
              background: r.occupant ? 'var(--card)' : 'var(--bg)',
              color: 'var(--fg)',
              padding: '4px 8px',
              fontSize: 11,
              fontFamily: 'var(--font-body)',
              ...(isLit ? litStyle : {}),
            }}
          >
            {r.label}{r.occupant ? ` · ${r.occupant}` : ''}
          </button>
        );
      })}
    </div>
  );
}
