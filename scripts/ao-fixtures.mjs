// Captures real Adventurer Olympics views from the engine, one per kind of
// decision the table draws, so the table's tests and the /dev/ao page read
// what the engine actually sends rather than a hand-written guess.
//
//   node scripts/ao-fixtures.mjs <path to a built zekel checkout> [games]
//
// It plays seeded games in-process with seat p1 a digital human and the rest
// AI. Every p1 decision is the engine's own AI move for that seat; every Draw
// and Roll is the button. The first time each pending kind (and a few richer
// moments) comes up, it records the deciding seat's view, legal moves and
// grey list, and one other seat's view. Output: apps/web/src/tests/fixtures/ao/*.json

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const engineRoot = resolve(process.argv[2] ?? '../zekel');
const games = Number(process.argv[3] ?? 10);
const mod = await import(pathToFileURL(join(engineRoot, 'dist/games/adventurer-olympics/index.js')).href);
const game = mod.adventurerOlympics;
const { unavailableMoves } = await import(pathToFileURL(join(engineRoot, 'dist/core/moveGates.js')).href);
const greyOf = (s, who, legal) => (game.describeMoveGates ? unavailableMoves(game.describeMoveGates(s, who), legal) : [])
  .map((g) => ({ moveType: g.move_type, ...(g.item !== undefined ? { item: g.item } : {}), reason: g.reason }));

const outDir = resolve('apps/web/src/tests/fixtures/ao');
mkdirSync(outDir, { recursive: true });

// The printed catalogue, in the shape the server's reference endpoint returns.
writeFileSync(resolve('apps/web/src/tests/fixtures/ao-reference.json'), JSON.stringify({
  gameId: 'adventurer-olympics', rules: game.getRulesText(), moveSchema: game.moveSchema ?? null,
  optionsSchema: game.optionsSchema ?? null, referenceData: game.getReferenceData?.() ?? null,
}, null, 1));

const seen = new Set();

function capture(s, name, who) {
  const others = s.players.map((p) => p.player_id).filter((id) => id !== who);
  const legal = game.getLegalMoves(s, who);
  writeFileSync(join(outDir, `${name}.json`), JSON.stringify({
    key: name,
    players: s.players.length,
    viewer: who,
    view: game.getPlayerView(s, who),
    legalMoves: legal,
    unavailable: greyOf(s, who, legal),
    watcher: others[0],
    watcherView: game.getPlayerView(s, others[0]),
    watcherLegalMoves: game.getLegalMoves(s, others[0]),
  }, null, 1));
}

function once(name, s, who) {
  if (seen.has(name)) return;
  seen.add(name);
  capture(s, name, who);
}

for (let g = 0; g < games; g++) {
  const n = [2, 4, 3][g % 3];
  const players = Array.from({ length: n }, (_, i) => (i === 0
    ? { player_id: 'p1', kind: 'human', table: 'digital', name: 'You' }
    : { player_id: `p${i + 1}`, kind: 'ai', difficulty: 'medium' }));
  let s = game.createSession(players, { seed: 3000 + g });
  let plies = 0;
  while (!game.isGameOver(s) && plies < 3000) {
    const p = s.gameState.pending;
    if (!p) break;
    const who = p.seat;
    const legal = game.getLegalMoves(s, who);
    if (who === 'p1') {
      const kind = p.kind;
      const pay = p.payload ?? {};
      const sfx = n === 2 ? '' : '-multi';
      once(`${kind}${kind === 'roll' ? `-${pay.rollKind}` : ''}${kind === 'draw' ? `-${pay.deck}` : ''}${kind === 'explore_place' ? `-${pay.context}` : ''}${sfx}`, s, who);
      const me = s.gameState.players.p1;
      if (kind === 'move' && legal.some((m) => m.move.type === 'explore')) once(`move-can-explore${sfx}`, s, who);
      if (kind === 'move' && me.companions.length + me.littleMonsters.length + me.bigMonsters.length + me.artifacts.length >= 3) once(`move-late${sfx}`, s, who);
      if (kind === 'roll' && pay.dungeon) once(`roll-test-dungeon${sfx}`, s, who);
      if (kind === 'draw' && pay.dungeon) once(`draw-${pay.deck}-dungeon${sfx}`, s, who);
      if (s.gameState.dungeonResolving && kind === 'draw' && pay.deck === 'dungeon') once(`draw-dungeon-again${sfx}`, s, who);
    }
    if (legal.length === 0) break;
    let move;
    if (who === 'p1' && legal.length === 1 && legal[0].move.type === 'resolve_report') move = legal[0].move;
    else if (who === 'p1' && (p.kind === 'setup_standee_colour')) move = { type: 'setup_standee', standee: 'Fighter', colour: legal[0].move.colour };
    else move = (await game.getAIMove(s, who, 'medium')).move;
    try {
      s = game.applyMove(s, who, move).newState;
    } catch (e) {
      console.error(`game ${g} ply ${plies}: ${e.message}`);
      break;
    }
    // Just after a roll landed: the view with the dice in it.
    if (who === 'p1' && move.type === 'resolve_report' && p.kind === 'roll') once(`after-roll-${p.payload?.rollKind}${n === 2 ? '' : '-multi'}`, s, who);
    plies++;
  }
  if (game.isGameOver(s)) once(`game-over${n === 2 ? '' : '-multi'}`, s, 'p1');
  console.log(`game ${g} (${n}p): ${plies} plies, over=${!!game.isGameOver(s)}`);
}
// Rare steps random games seldom reach, set up by hand from a real session
// (the same way the engine's own tests do): the state is the engine's, only
// the deck order or the completed flags are arranged so the step comes up.
async function toP1Move(seed) {
  let s = game.createSession([
    { player_id: 'p1', kind: 'human', table: 'digital', name: 'You' },
    { player_id: 'p2', kind: 'ai', difficulty: 'medium' },
  ], { seed });
  for (let i = 0; i < 400 && !(s.gameState.pending?.kind === 'move' && s.gameState.pending.seat === 'p1'); i++) {
    const p = s.gameState.pending;
    const legal = game.getLegalMoves(s, p.seat);
    const move = p.seat === 'p1'
      ? (p.kind === 'setup_standee_colour' ? { type: 'setup_standee', standee: 'Fighter', colour: legal[0].move.colour } : legal.find((m) => m.move.type === 'resolve_report')?.move ?? (await game.getAIMove(s, 'p1', 'medium')).move)
      : (await game.getAIMove(s, p.seat, 'medium')).move;
    s = game.applyMove(s, p.seat, move).newState;
  }
  return s;
}
const clone = (s) => JSON.parse(JSON.stringify(s));
for (let seed = 4100; seed < 4120 && !seen.has('explore_place-dungeon_map'); seed++) {
  // A Dungeon Map card, then Draw for the tile, then placing it anywhere.
  let s = clone(await toP1Move(seed));
  const g = s.gameState;
  const dungeon = g.iconHexes.find((h) => h.kind === 'dungeon' && !h.completed);
  if (dungeon) {
    g.decks.dungeon = ['map', ...g.decks.dungeon.filter((k) => k !== 'map')];
    const occupied = new Set(g.playerOrder.filter((p) => p !== 'p1').map((p) => g.players[p].hexKey));
    const [q, r] = dungeon.key.split(',').map(Number);
    const next = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(([a, b]) => `${q + a},${r + b}`)
      .find((k) => g.hexes[k] && !occupied.has(k) && !g.iconHexes.some((h) => h.key === k && !h.completed));
    if (next) {
      g.players.p1.hexKey = next;
      g.players.p1.stepsLeft = 1;
      s = game.applyMove(s, 'p1', { type: 'step', to: dungeon.key }).newState;
      s = game.applyMove(s, 'p1', { type: 'resolve_report' }).newState; // the Map card
      once('draw-tile-dungeon_map', s, 'p1');
      s = game.applyMove(s, 'p1', { type: 'resolve_report' }).newState; // the tile
      once('explore_place-dungeon_map', s, 'p1');
    }
  }
}
for (let seed = 4200; seed < 4220 && !seen.has('draw-dungeon-again'); seed++) {
  // "Any artifact" when you hold all four suit runes: it gives nothing, so Draw again.
  let s = clone(await toP1Move(seed));
  const g = s.gameState;
  const dungeon = g.iconHexes.find((h) => h.kind === 'dungeon' && !h.completed);
  if (dungeon) {
    for (const pid of g.playerOrder) g.players[pid].artifacts = g.players[pid].artifacts.filter((a) => a === 'star');
    g.players.p1.artifacts = ['hearts', 'spades', 'diamonds', 'clubs'];
    g.decks.dungeon = ['any_artifact', ...g.decks.dungeon.filter((k) => k !== 'any_artifact')];
    const occupied = new Set(g.playerOrder.filter((p) => p !== 'p1').map((p) => g.players[p].hexKey));
    const [q, r] = dungeon.key.split(',').map(Number);
    const next = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(([a, b]) => `${q + a},${r + b}`)
      .find((k) => g.hexes[k] && !occupied.has(k) && !g.iconHexes.some((h) => h.key === k && !h.completed));
    if (next) {
      g.players.p1.hexKey = next;
      g.players.p1.stepsLeft = 1;
      s = game.applyMove(s, 'p1', { type: 'step', to: dungeon.key }).newState;
      s = game.applyMove(s, 'p1', { type: 'resolve_report' }).newState;
      once('draw-dungeon-again', s, 'p1');
    }
  }
}
{
  // A forced explore: every icon on the map completed at the start of your turn.
  let s = clone(await toP1Move(4300));
  const g = s.gameState;
  for (const h of g.iconHexes) { h.completed = true; h.completedBy = h.completedBy ?? 'p2'; }
  g.players.p1.initiative = 2;
  g.players.p2.initiative = 1;
  g.pending = { kind: 'move', seat: 'p2' };
  g.activeSeat = 'p2';
  s = game.applyMove(s, 'p2', { type: 'stop' }).newState;
  once('draw-tile-forced', s, 'p1');
  s = game.applyMove(s, 'p1', { type: 'resolve_report' }).newState;
  once('explore_place-forced', s, 'p1');
}
console.log([...seen].sort().join('\n'));
