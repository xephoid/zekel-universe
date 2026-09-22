// The eight primitives take the same data fields as the engine's web
// component library (zekel src/web/components/*.ts), so a board description
// written for the engine's debug client works here unchanged. Fields marked
// "Universe addition" are optional extras the engine ignores.

/** <zekel-card>: one physical card. */
export interface CardData {
  label: string;
  id?: string;
  /** Theme key for the card's face color (owner, suit, type...). */
  colorKey?: string;
  face?: 'up' | 'down';
  /** Tapped/exhausted (90) or upside down (180). */
  rotation?: 0 | 90 | 180 | 270;
  count?: number;
  badges?: string[];
  /** Universe addition: a second line under the label. */
  subtitle?: string;
  /** Universe addition: what playing this card costs, drawn as a pip in the
   *  corner rather than as one badge among many. */
  cost?: string | number;
  /**
   * Universe addition: what this card stacks with when a hand grows past
   * what a fan can hold — a faction, a suit, a borough. Squeezing a fan
   * tighter stops working long before a thumb runs out of room, so past
   * eleven cards the hand folds into stacks on this key instead.
   */
  groupKey?: string;
  /** Universe addition: art for the face. */
  artUrl?: string;
  /**
   * Universe addition: several counts on one card, for a stack drawn once
   * but owned separately (each player's own copies of a supply card).
   * `own` marks the viewer's count so it can be drawn stronger.
   */
  counts?: { label: string; value: number; own?: boolean }[];
}

/** <zekel-card-zone>: a row, a fan, or a pile of cards. */
export interface CardZoneData {
  label?: string;
  mode: 'row' | 'fan' | 'pile';
  cards?: CardData[];
  /** Hidden pile: no cards, just how many. */
  countOnly?: number;
  /**
   * Universe addition: the key's printed name, for a stack's label when a
   * fan folds. A key with no name here is put into words.
   */
  groupNames?: Record<string, string>;
  /**
   * Universe addition: `small` draws the cards as name chips rather than
   * faces, for a zone whose job is to show a shape (Cybernoir's case file)
   * rather than let you read a card.
   */
  size?: 'small';
  /**
   * Universe addition: how many empty slots to draw after the cards. A zone
   * whose shape is part of the game — Cybernoir's thirteen evidence slots,
   * visible from turn one — says what is still missing, instead of the zone
   * growing out of nothing.
   */
  empty?: number;
}

/** <zekel-tableau>: a player board with stat rows and nested zones. */
export interface TableauData {
  label?: string;
  /** Theme key for the board's accent (usually the faction/player). */
  owner?: string;
  active?: boolean;
  stats?: { label: string; value: string | number; max?: number }[];
  /** Universe addition: what the active badge says (default "their turn"). */
  activeLabel?: string;
  /** Universe addition: a portrait for the owner, shown beside the title. */
  artUrl?: string;
}

/** <zekel-bag>: a push-your-luck draw bag. */
export interface BagData {
  label?: string;
  owner?: string;
  /** Composition when the viewer may know it (owner's own bag). */
  contents?: { label: string; count: number; colorKey?: string }[];
  /** Otherwise just how many chips are inside. */
  count?: number;
  /** Pulled chips in pull order. */
  revealRow?: CardData[];
  /** 'drawing' | 'busted' | 'halted' | game-defined. */
  status?: string;
}

export interface TrackSpace {
  index: number | string;
  label?: string;
  filled?: boolean;
  /** Pieces standing ON the space (pawns): theme-colored dots. */
  pieces?: { label: string; colorKey?: string }[];
}

/** <zekel-track>: a line or ring of spaces. */
export interface TrackData {
  label?: string;
  cyclic?: boolean;
  spaces: TrackSpace[];
  /** Markers pointing at a space from above (time/reputation style). */
  markers?: { label: string; colorKey?: string; at: number | string }[];
  /**
   * Universe addition: `named` draws what stands on a space as a stack of
   * named chips rather than anonymous pawns — Cybernoir's jail, whose three
   * slots each hold a stack of face-up cards, and where who is in them is
   * the whole point. `pawn` is the default.
   */
  pieceShape?: 'pawn' | 'named';
  /** Universe addition: draw an arrow between spaces, for a track whose
   *  pieces are carried along it rather than moved by the player. */
  arrows?: boolean;
}

/** <zekel-pool>: a supply of counted things. */
export interface PoolData {
  label?: string;
  items: { label: string; count: number; colorKey?: string }[];
}

export interface GridCell {
  x: number;
  y: number;
  /** Theme key for the cell fill. */
  terrain?: string;
  pieces?: { label: string; colorKey?: string; badges?: string[] }[];
}

/** <zekel-grid>: a square-cell board. x = column, y = row, y down. */
export interface GridData {
  label?: string;
  /** Fixed extent so empty rim cells render; defaults to the cells' bounds. */
  extent?: { minX: number; minY: number; maxX: number; maxY: number };
  cells: GridCell[];
  /** Show coordinate rulers (debugging boards). */
  coordinates?: boolean;
}

export interface MapNode {
  id: string;
  label: string;
  /** Percent of container, 0-100. */
  x: number;
  y: number;
  /** Theme key for the region blob (defaults to the label). */
  colorKey?: string;
  /** Relative blob size, 1 = default. */
  size?: number;
  badges?: string[];
  pieces?: { label: string; colorKey?: string; count?: number }[];
  /** Universe addition: art drawn inside the node (a treat, a landmark). */
  artUrl?: string;
  /** Universe addition: node ids this node connects to by a road. */
  roadsTo?: string[];
  /** Universe addition: the area of the board this region belongs to. */
  area?: string;
}

/** <zekel-map>: a positional board of named regions. */
export interface MapData {
  label?: string;
  /** Board aspect ratio as height/width percent (default 62). */
  aspect?: number;
  nodes: MapNode[];
  /**
   * Universe addition: named parts of the board, drawn as labelled bands
   * behind the regions that belong to them — Cybernoir's nineteen locations
   * grouped in three boroughs. The nodes keep their own coordinates; a band
   * says what part of the board they are standing in.
   */
  areas?: Array<{ key: string; label: string; note?: string; y: number; height: number; colorKey?: string }>;
  /**
   * Universe addition: `pill` draws a region wide enough to hold its name,
   * for a board whose regions are places rather than spaces. `dot` is the
   * default, for boards with many small spaces.
   */
  nodeShape?: 'dot' | 'pill';
}

/** One select event, common to every primitive. */
export interface SelectEvent {
  component: 'card' | 'card-zone' | 'tableau' | 'bag' | 'track' | 'pool' | 'grid' | 'map';
  id: string;
  label: string;
}

/** Color key to CSS color, supplied by the game. */
export type Palette = Record<string, string>;
