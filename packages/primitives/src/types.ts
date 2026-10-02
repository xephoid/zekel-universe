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
  /** Universe addition: a second number, in the top corner opposite the
   *  cost: what a resource card is worth. */
  value?: string | number;
  /** Universe addition: art for the face. */
  artUrl?: string;
  /**
   * Universe addition: several counts on one card, for a stack drawn once
   * but owned separately (each player's own copies of a supply card).
   * `own` marks the viewer's count so it can be drawn stronger.
   */
  counts?: { label: string; value: number; own?: boolean }[];
  /** Universe addition: one word stamped across the face (a revealed
   *  informant's BLOWN), drawn over the art and said to a reader. */
  stamp?: string;
  /** Universe addition: words on the back of a face-down card (NO SIGNAL),
   *  for a card whose back means something the plain back does not say. */
  backLabel?: string;
  /**
   * Universe additions: how the face is laid out. `portrait` puts the art
   * across the top, edge to edge, with the cost and the emblem in its
   * corners, then a rule in the card's colour, the name, the subtitle and the
   * badges (a person). `sign` puts a light plate across the top holding
   * `code` in a disc of the card's colour, the name and the subtitle (a
   * station sign), then the meter and badges, then `faces` (a place and who
   * lives there). Without a layout the face is the plain card painted in its
   * colour.
   */
  layout?: 'portrait' | 'sign';
  /** Universe addition: a small picture in the face's top corner (a faction
   *  mark). Decoration: say what it means in a badge too. */
  emblemUrl?: string;
  /** Universe addition: `pips` draws a numeric cost as that many pips, and a
   *  cost of nothing as FREE. */
  costStyle?: 'number' | 'pips';
  /** Universe addition, `sign` layout: a short code in a disc (a line bullet). */
  code?: string;
  /** Universe addition, `sign` layout: a bar of `max` pips, `value` filled. */
  meter?: { value: number; max: number };
  /** Universe addition, `sign` layout: small round pictures of people, each
   *  named by its title. */
  faces?: { label: string; artUrl?: string }[];
  /** Universe addition, `sign` layout: one quiet line where the faces go
   *  (nobody home). */
  note?: string;
  /** Universe addition: where this card comes from when it is new, as flip
   *  ids separated by "|" (the first that was on the table wins). Overrides
   *  the zone's arriveFrom for this card. */
  arriveFrom?: string;
}

/** <zekel-card-zone>: a row, a fan, or a pile of cards. */
export interface CardZoneData {
  label?: string;
  /**
   * `list` is a Universe addition the engine ignores: each card drawn flat,
   * as one row of cost, art, name, effects and counts, for a zone whose
   * job is to be read down (Fractured Fist's supply). The column names come
   * from the first card's `counts` labels.
   */
  mode: 'row' | 'fan' | 'pile' | 'list';
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
  /** Pieces standing ON the space (pawns): theme-colored dots. Universe
   *  addition: on a `named` track, `artUrl` draws a small picture beside the
   *  name (who is in a jail cell). */
  pieces?: { label: string; colorKey?: string; artUrl?: string }[];
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
  /**
   * Universe addition: `token` draws each space as a round slot a token sits
   * in (Cybernoir's three clue categories): the space's index small along
   * the top, its label large in the middle, a dashed rim and "?" while the
   * space is empty, a solid rim once it is `filled`. `cell` is the default.
   */
  spaceShape?: 'cell' | 'token';
}

/** <zekel-pool>: a supply of counted things. */
export interface PoolData {
  label?: string;
  /**
   * Universe additions: `caption` is a small word over the label, and `sash`
   * a word on a band across the token (a ruled-out clue's NOT). Both are
   * drawn only by the `token` shape.
   */
  items: { label: string; count: number; colorKey?: string; caption?: string; sash?: string }[];
  /**
   * Universe addition: `token` draws each item as one round token with its
   * label inside, its caption above, rimmed and lettered in its colour, the
   * sash across it; a fare token rather than a swatch and a name. `chip` is
   * the default.
   */
  itemShape?: 'chip' | 'token';
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
  /**
   * What stands on the node. Universe additions: `artUrl` draws a piece as a
   * picture (a standee) instead of a coloured dot, and `size` scales it
   * (1 = default); `kind: 'token'` lays a picture flat on the node (a coin)
   * where a figure would stand on it. A piece keeps its label from node to node, so moving it
   * slides it rather than making a new one.
   */
  pieces?: { label: string; colorKey?: string; count?: number; artUrl?: string; size?: number; kind?: 'figure' | 'token' }[];
  /** Universe addition: art drawn inside the node (a treat, a landmark). */
  artUrl?: string;
  /**
   * Universe addition, hex boards only (MapData.hex): the node's hex, in
   * axial coordinates for flat-topped hexes (q to the right, r down; the six
   * neighbours are q±1, r±1 and the two diagonals q+1,r-1 and q-1,r+1). The
   * node is drawn on that hex instead of at x/y.
   */
  hex?: { q: number; r: number };
  /**
   * Universe addition: a node that is not on the table yet, only a place a
   * piece could go (a slot a tile could fill). Drawn dashed and see-through.
   */
  ghost?: boolean;
  /** Universe addition: the node the player has picked in a choice not yet
   *  sent (the slot a tile is being turned in). Drawn outlined. */
  selected?: boolean;
  /**
   * Universe addition: the flip id of the element a new node flies in from
   * (a tile from the stack), so it does not appear in place.
   */
  arriveFrom?: string;
  /** Universe addition: node ids this node connects to by a road. */
  roadsTo?: string[];
  /** Universe addition: the area of the board this region belongs to. */
  area?: string;
  /**
   * Universe addition: this region is accounted for — played, ruled out,
   * spent. Drawn quieter and dashed, but keeping its own colour, because the
   * colour is what it *is* and the dimming is what happened to it.
   */
  dim?: boolean;
  /** Universe addition: what a reader hears instead of just the label, when
   *  the region's facts are carried by colour and position. */
  describedAs?: string;
  /**
   * Universe additions for a station board (MapData.nodeShape 'station').
   * `meter` is a small bar of `max` pips with `value` filled (a population).
   * `mark` replaces the ring with a solid diamond ('diamond', something put
   * on the place) or draws a diamond round it ('frame', a place that is
   * yours), in `markColorKey`, which the name then takes too. `crossed` draws
   * the ring dashed and strikes the name through. `glow` lights the ring in
   * its own colour. `labelSide` puts the name above or below the ring. A
   * station shows its state by these marks; its badges are not drawn, so say
   * the state in `describedAs` as well.
   */
  meter?: { value: number; max: number };
  mark?: 'diamond' | 'frame';
  markColorKey?: string;
  /** Universe addition: where a new diamond comes from, as flip ids
   *  separated by "|" (the first that was on the table wins), such as the card that was played;
   *  it flies from there and lands on the station. Without one it drops. */
  markFrom?: string;
  crossed?: boolean;
  glow?: boolean;
  labelSide?: 'above' | 'below';
}

/**
 * Universe addition: a line drawn under a station board, through the places
 * it belongs to. Decoration that encodes ownership: never a route, never
 * tapped, never animated as travel. Points are in percent of the board, like
 * the nodes; the line stretches with the board.
 */
export interface MapLine {
  key: string;
  colorKey: string;
  label?: string;
  points: Array<{ x: number; y: number }>;
}

/** How a legend entry is drawn: a colour dot (the default), or a station
 *  state from a station board, so the key matches the marks on the map. */
export type MapKeyShape = 'dot' | 'ring' | 'glow' | 'diamond' | 'crossed' | 'faded' | 'frame';

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
  areas?: Array<{ key: string; label: string; note?: string; y: number; height: number; colorKey?: string; x?: number; width?: number }>;
  /**
   * Universe addition: `pill` draws a region wide enough to hold its name,
   * for a board whose regions are places rather than spaces. `dot` is the
   * default, for boards with many small spaces. `station` draws each region
   * as a ring on a transit map, its name and meter beside it, over `lines`;
   * an area with `x` and `width` is then a column with its name above it.
   */
  nodeShape?: 'dot' | 'pill' | 'station';
  /** Universe addition, station boards only: the lines under the stations. */
  lines?: MapLine[];
  /**
   * Universe addition: every region can be looked at, not only the ones that
   * are legal moves. Looking is always safe: a region with no move behind it
   * reports the tap and nothing is sent.
   */
  inspectable?: boolean;
  /** Universe addition: what the colours mean, drawn under the board. A board
   *  that codes anything by colour owes the reader this. */
  legend?: Array<{ colorKey: string; label: string; shape?: MapKeyShape }>;
  /** Universe addition: one sentence under the legend (what the lines mean). */
  legendNote?: string;
  /**
   * Universe addition: take the height the board has left instead of working
   * it out from the width. `aspect` says a board's height is a fraction of how
   * wide it happens to be, which is right for a drawn map and wrong for one
   * whose regions are rows of pills: a wide window then makes a board taller
   * than the screen, and the bottom rows fall off it. Filling asks the layout
   * for the room that is actually there. `minHeight` is the floor in pixels
   * below which the regions would collide, and under which the board scrolls
   * rather than being crushed.
   */
  fill?: { minHeight: number };
  /**
   * Universe addition: a board of flat-topped hexes. Every node carries a
   * `hex` coordinate and is drawn on it; the board scales to hold them all
   * and keeps them centred. `x`, `y`, `aspect`, roads and areas are not used.
   */
  hex?: {
    orientation: 'flat';
    /** The largest a hex may be drawn, as its radius in pixels: a small map
     *  stays at the board's own scale instead of growing to fill the room. */
    maxRadius?: number;
    /** Drawn this many times the fitted size (1 = fit); past the room the
     *  board scrolls. */
    zoom?: number;
    /** Each hex drawn by hand, with a wobbling ink edge, rather than as a
     *  flat cut shape. The face and edge colours come from the --hex-face and
     *  --hex-edge custom properties, so a theme sets them per state. */
    drawn?: boolean;
  };
}

/** One select event, common to every primitive. */
export interface SelectEvent {
  component: 'card' | 'card-zone' | 'tableau' | 'bag' | 'track' | 'pool' | 'grid' | 'map';
  id: string;
  label: string;
}

/** Color key to CSS color, supplied by the game. */
export type Palette = Record<string, string>;
