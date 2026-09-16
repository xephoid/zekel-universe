// Renders a glue Zone onto the matching primitive, passing previous for FLIP,
// lit ids and the palette through. Unknown zones render as a JSON inspector.

import { Bag, CardZone, Grid, Map, Pool, Tableau, Track } from '@universe/primitives';
import type { CardZoneData, GridData, MapData, PoolData, TableauData, TrackData, BagData } from '@universe/primitives';
import type { Zone } from '../glue/types';
import type { SelectEvent } from '../glue/primitiveTree';

interface Props {
  zone: Zone;
  lit: string[];
  palette?: Record<string, string>;
  onSelect: (e: SelectEvent) => void;
}

export function ZoneRenderer({ zone, lit, palette, onSelect }: Props) {
  const d = zone.data;
  const prev = zone.previous;
  const body = (() => {
    switch (zone.kind) {
      case 'card-zone':
        return <CardZone data={d as unknown as CardZoneData} previous={prev as CardZoneData | undefined} lit={lit} palette={palette} onSelect={onSelect} />;
      case 'tableau':
        return <Tableau data={d as unknown as TableauData} previous={prev as TableauData | undefined} lit={lit} palette={palette} onSelect={onSelect} />;
      case 'bag':
        return <Bag data={d as unknown as BagData} previous={prev as BagData | undefined} lit={lit} palette={palette} onSelect={onSelect} />;
      case 'track':
        return <Track data={d as unknown as TrackData} previous={prev as TrackData | undefined} lit={lit} palette={palette} onSelect={onSelect} />;
      case 'pool':
        return <Pool data={d as unknown as PoolData} previous={prev as PoolData | undefined} lit={lit} palette={palette} onSelect={onSelect} />;
      case 'grid':
        return <Grid data={d as unknown as GridData} previous={prev as GridData | undefined} lit={lit} palette={palette} onSelect={onSelect} />;
      case 'map':
        return <Map data={d as unknown as MapData} previous={prev as MapData | undefined} lit={lit} palette={palette} onSelect={onSelect} />;
      default:
        return <JsonInspector value={d} />;
    }
  })();
  return (
    <div>
      {zone.label && <div style={{ fontSize: 12, color: 'var(--fg-muted)', margin: '4px 0' }}>{zone.label}</div>}
      {body}
      {/* Glues attach public counters as `stats`; rendered under the zone. */}
      {typeof d['stats'] === 'object' && d['stats'] !== null && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, fontFamily: 'var(--font-mono)', marginTop: 6 }}>
          {Object.entries(d['stats'] as Record<string, unknown>).map(([k, v]) => (
            <span key={k} style={{ color: 'var(--fg-muted)' }}>
              {k} <strong style={{ color: 'var(--fg)' }}>{String(v)}</strong>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Generic fallback for views no glue recognizes: an honest JSON inspector. */
export function JsonInspector({ value }: { value: unknown }) {
  return (
    <pre style={{
      background: 'var(--bg-raised)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)', padding: 12, overflowX: 'auto',
      fontFamily: 'var(--font-mono)', fontSize: 12, maxHeight: 400, overflowY: 'auto',
    }}>
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
