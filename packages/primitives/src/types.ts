// Data fields match the engine's web component library, so a board
// description written for the engine's debug client works here unchanged.

export interface CardData {
  id: string;
  title: string;
  subtitle?: string;
  artUrl?: string;
  /** color key the game's glue module resolves from a palette */
  colorKey?: string;
  faceDown?: boolean;
  count?: number; // for stacked representations
}

export interface CardZoneData {
  id: string;
  kind: 'fan' | 'stack' | 'row' | 'grid';
  cards: CardData[];
  faceDown?: boolean;
  label?: string;
}

export interface TableauData {
  id: string;
  label?: string;
  zones: CardZoneData[];
  colorKey?: string;
}

export interface BagData {
  id: string;
  label?: string;
  /** Hidden contents; only count is known when hidden. */
  count: number;
  contents?: string[]; // revealed items, if any
}

export interface TrackData {
  id: string;
  label?: string;
  length: number;
  /** marker id → position */
  markers: Record<string, number>;
  colorKey?: string;
}

export interface PoolData {
  id: string;
  label?: string;
  /** token color key → count */
  tokens: Record<string, number>;
}

export interface GridData {
  id: string;
  width: number;
  height: number;
  cells: Array<{ x: number; y: number; occupant?: string; colorKey?: string; label?: string }>;
}

export interface MapRegionData {
  id: string;
  label: string;
  x: number; // percent coordinates on the map plane
  y: number;
  colorKey?: string;
  occupant?: string;
  roadsTo?: string[]; // region ids — junction roads drawn as lines
}

export interface MapData {
  id: string;
  regions: MapRegionData[];
}

/** One select event, common to every primitive. */
export interface SelectEvent {
  component: string; // 'card' | 'card-zone' | 'tableau' | 'bag' | 'track' | 'pool' | 'grid' | 'map'
  id: string;
  label: string;
}
