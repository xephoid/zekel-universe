// Renders a glue Zone onto the matching primitive, passing the lit ids and
// the select callback through. Unknown views render as a JSON inspector.

import { Bag, CardZone, Grid, Map, Pool, Tableau, Track } from '@universe/primitives';
import type { SelectEvent } from '@universe/primitives';
import type { Zone } from './types';

interface Props {
  zone: Zone;
  lit: string[];
  onSelect: (e: SelectEvent) => void;
}

export function ZoneRenderer({ zone, lit, onSelect }: Props) {
  switch (zone.kind) {
    case 'card-zone':
      return <CardZone id={zone.id} data={zone.data} lit={lit} onSelect={onSelect} arriveFrom={zone.arriveFrom} />;
    case 'tableau':
      return (
        <Tableau id={zone.id} data={zone.data}>
          {zone.children?.map((z) => <ZoneRenderer key={z.id} zone={z} lit={lit} onSelect={onSelect} />)}
        </Tableau>
      );
    case 'bag':
      return <Bag id={zone.id} data={zone.data} lit={lit} onSelect={onSelect} />;
    case 'track':
      return <Track id={zone.id} data={zone.data} lit={lit} onSelect={onSelect} />;
    case 'pool':
      return <Pool id={zone.id} data={zone.data} lit={lit} onSelect={onSelect} />;
    case 'grid':
      return <Grid id={zone.id} data={zone.data} lit={lit} onSelect={onSelect} />;
    case 'map':
      return <Map id={zone.id} data={zone.data} lit={lit} onSelect={onSelect} />;
  }
}

/** Generic fallback for views no glue recognizes: an honest JSON inspector. */
export function JsonInspector({ value }: { value: unknown }) {
  return (
    <pre className="json-inspector">{JSON.stringify(value, null, 2)}</pre>
  );
}
