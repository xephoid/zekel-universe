import type { TableEventWire } from '@universe/shared';

/** A wire event with every field filled, for queue and table tests. */
export function ev(seq: number, tag: string, extra: Partial<TableEventWire> = {}): TableEventWire {
  return {
    seq, kind: 'move', actorSeatPosition: 0, summary: tag, engineMove: null, view: { tag },
    legalMoves: [], unavailable: [], moveMenu: null, briefing: null, yourTurn: false, playerId: 'p1',
    nextActorPosition: null, gameOver: null, rewindToSeq: null, createdAt: '2026-09-16T00:00:00.000Z',
    ...extra,
  };
}
