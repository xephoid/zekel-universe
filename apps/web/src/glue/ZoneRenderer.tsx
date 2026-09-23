// Renders a glue Zone onto the matching primitive, passing the lit ids and
// the select callback through. Unknown views render as a JSON inspector.

import type { ReactNode } from 'react';
import { Bag, CardZone, Grid, Map, Pool, Tableau, Track } from '@universe/primitives';
import type { SelectEvent } from '@universe/primitives';
import type { Zone } from './types';

interface Props {
  zone: Zone;
  lit: string[];
  onSelect: (e: SelectEvent) => void;
}

export function ZoneRenderer({ zone, lit, onSelect }: Props) {
  const span = zone.span === 'full' ? ' span-full' : '';
  switch (zone.kind) {
    case 'card-zone':
      return <CardZone id={zone.id} data={zone.data} lit={lit} onSelect={onSelect} arriveFrom={zone.arriveFrom} className={`zone zone-card-zone${span}`} />;
    case 'tableau':
      return (
        <Tableau id={zone.id} data={zone.data} className={`zone zone-tableau${span}`}>
          {zone.children?.map((z) => <ZoneRenderer key={z.id} zone={z} lit={lit} onSelect={onSelect} />)}
        </Tableau>
      );
    case 'bag':
      return <Bag id={zone.id} data={zone.data} lit={lit} onSelect={onSelect} className={`zone zone-bag${span}`} />;
    case 'track':
      return <Track id={zone.id} data={zone.data} lit={lit} onSelect={onSelect} className={`zone zone-track${span}`} />;
    case 'pool':
      return <Pool id={zone.id} data={zone.data} lit={lit} onSelect={onSelect} className={`zone zone-pool${span}`} />;
    case 'grid':
      return <Grid id={zone.id} data={zone.data} lit={lit} onSelect={onSelect} className={`zone zone-grid${span}`} />;
    case 'map':
      return <Map id={zone.id} data={zone.data} lit={lit} onSelect={onSelect} className={`zone zone-map${span}`} />;
  }
}

/**
 * Lay the board's zones out. Zones marked `row` gather into one band, so a
 * few short panels sit side by side instead of each claiming a row of their
 * own; when a zone asks to fill, the board becomes a column and that zone
 * takes the height the band does not.
 */
export function BoardZones({ zones, lit, onSelect }: { zones: Zone[]; lit: string[]; onSelect: (e: SelectEvent) => void }) {
  const fills = zones.some((z) => z.kind === 'map' && !!z.data.fill);
  const out: ReactNode[] = [];
  let band: Zone[] = [];
  const closeBand = () => {
    if (band.length === 0) return;
    out.push(
      <div className="zone-row" key={`row:${band[0]!.id}`}>
        {band.map((z) => <ZoneRenderer key={z.id} zone={z} lit={lit} onSelect={onSelect} />)}
      </div>,
    );
    band = [];
  };
  for (const z of zones) {
    if (z.span === 'row') { band.push(z); continue; }
    closeBand();
    out.push(<ZoneRenderer key={z.id} zone={z} lit={lit} onSelect={onSelect} />);
  }
  closeBand();
  return <div className={fills ? 'zones zones-fill' : 'zones'}>{out}</div>;
}

/** Generic fallback for views no glue recognizes: an honest JSON inspector. */
export function JsonInspector({ value }: { value: unknown }) {
  return (
    <pre className="json-inspector">{JSON.stringify(value, null, 2)}</pre>
  );
}
