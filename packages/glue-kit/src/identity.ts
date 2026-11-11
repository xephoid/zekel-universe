// Card identity across views. The engine describes a hand as a list of card
// ids, and identical cards share an id, so the browser assigns each physical
// card an instance id that survives from one view to the next. That is what
// lets a card fly from the hand to the played row instead of appearing there.
//
// The rule: a card keeps its instance when it stays in its zone; a card that
// vanished from one zone and appeared in another is the same instance; a
// card that appeared from nowhere is new and comes from the zone's source
// (a deck, a supply), so it can fly in from there.

export interface ZoneContents {
  /** zone name to the ordered card ids the view shows there */
  [zone: string]: string[];
}

export interface IdentityState {
  /** zone name to the ordered instance ids */
  zones: Record<string, string[]>;
  /** instance id to the flip id it should arrive from; only for new instances */
  arrivals: Record<string, string>;
  counter: number;
}

export interface IdentityHints {
  /** a zone and index known to have been the source of one move, e.g. hand[2] */
  movedFrom?: { zone: string; index: number };
  /** zones whose previous contents all left (a cleanup); nothing stays in them */
  clearedZones?: string[];
  /** where a new instance in a zone comes from, by zone name */
  sources?: Record<string, string>;
}

function cardOf(instance: string): string {
  return instance.slice(instance.indexOf('|') + 1, instance.lastIndexOf('#'));
}

/**
 * Carry instance ids from `prev` (may be null) to the zones in `next`.
 * `owner` prefixes instance ids so two players' identical cards never share one.
 */
export function trackIdentities(
  owner: string,
  prev: IdentityState | null,
  next: ZoneContents,
  hints: IdentityHints = {},
): IdentityState {
  let counter = prev?.counter ?? 0;
  const zones: Record<string, string[]> = {};
  const arrivals: Record<string, string> = {};

  // Instances available to reassign, per card id, in the order they were
  // freed. A hinted move goes first so a tap on the third Focus makes the
  // third Focus fly.
  const freed = new Map<string, string[]>();
  const free = (instance: string, front = false) => {
    const card = cardOf(instance);
    const list = freed.get(card) ?? [];
    if (front) list.unshift(instance); else list.push(instance);
    freed.set(card, list);
  };

  const prevZones = prev?.zones ?? {};
  // Pass 1: keep what stayed in place. Match each zone's cards against the
  // zone's previous instances by card id, in order.
  const kept: Record<string, Array<string | null>> = {};
  const used = new Set<string>();
  for (const [zone, cards] of Object.entries(next)) {
    const cleared = hints.clearedZones?.includes(zone) ?? false;
    const before = cleared ? [] : [...(prevZones[zone] ?? [])];
    if (cleared) for (const inst of prevZones[zone] ?? []) free(inst);
    const hinted = hints.movedFrom?.zone === zone ? hints.movedFrom.index : -1;
    if (hinted >= 0 && hinted < before.length) {
      // The hinted card left this zone: it must not be kept here.
      const [moved] = before.splice(hinted, 1);
      if (moved) free(moved, true);
    }
    const result: Array<string | null> = [];
    for (const card of cards) {
      const idx = before.findIndex((inst) => inst !== null && cardOf(inst) === card && !used.has(inst));
      if (idx >= 0) {
        const inst = before[idx]!;
        used.add(inst);
        before[idx] = null as unknown as string;
        result.push(inst);
      } else {
        result.push(null);
      }
    }
    kept[zone] = result;
    for (const inst of before) if (inst) free(inst);
  }
  // Instances in zones that no longer exist are freed too.
  for (const [zone, list] of Object.entries(prevZones)) {
    if (!(zone in next)) for (const inst of list) free(inst);
  }

  // Pass 2: fill the holes with freed instances of the same card (a card
  // that moved between zones), else mint a new instance arriving from the
  // zone's source.
  // Zones that were cleared are filled last, so a freed card reaches its
  // real destination before the cleared zone refills from its source.
  const order = Object.entries(next).sort(([a], [b]) => {
    const ca = hints.clearedZones?.includes(a) ? 1 : 0;
    const cb = hints.clearedZones?.includes(b) ? 1 : 0;
    return ca - cb;
  });
  for (const [zone, cards] of order) {
    const result = kept[zone]!;
    for (let i = 0; i < cards.length; i++) {
      if (result[i]) continue;
      const card = cards[i]!;
      const list = freed.get(card);
      const reused = list?.shift();
      if (reused) {
        result[i] = reused;
        continue;
      }
      counter += 1;
      const inst = `${owner}|${card}#${counter}`;
      result[i] = inst;
      const source = hints.sources?.[zone];
      if (source) arrivals[inst] = source;
    }
    zones[zone] = result as string[];
  }
  return { zones, arrivals, counter };
}
