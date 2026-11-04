// Captures real Warble Way Galaxy views from the engine, one per moment the
// table's screen draws differently, so the screen's tests read what the
// engine actually sends rather than a hand-written guess.
//
//   node scripts/ww-fixtures.mjs <path to a built zekel-games checkout> [games]
//
// It plays seeded solo games in-process on a digital seat (the engine's own
// AI picks every move, and the Roll and Draw buttons are pressed for it) and,
// the first time each pending kind, roll reason, combat stage, ruin moment or
// phase appears, records the view, the legal moves and the grey list.
// Output: apps/web/src/tests/fixtures/ww/*.json and ww-reference.json.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const gamesRoot = resolve(process.argv[2] ?? '../zekel-games');
const games = Number(process.argv[3] ?? 8);
const pkg = join(gamesRoot, 'packages/warble-way-galaxy');
const mod = await import(pathToFileURL(join(pkg, 'dist/index.js')).href);
const game = mod.warbleWayGalaxy;
let unavailableMoves = null;
try {
  const kit = await import(pathToFileURL(join(pkg, 'node_modules/@zekel/game-kit/dist/index.js')).href);
  unavailableMoves = kit.unavailableMoves ?? null;
} catch { /* no grey list in this kit */ }
const greyOf = (s, who, legal) => (unavailableMoves && game.describeMoveGates ? unavailableMoves(game.describeMoveGates(s, who), legal) : [])
  .map((g) => ({ moveType: g.move_type, ...(g.item !== undefined ? { item: g.item } : {}), reason: g.reason }));

const outDir = resolve('apps/web/src/tests/fixtures/ww');
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve('apps/web/src/tests/fixtures/ww-reference.json'), JSON.stringify({
  gameId: 'warble-way-galaxy', rules: '', moveSchema: game.moveSchema ?? {},
  optionsSchema: game.optionsSchema ?? {}, referenceData: game.getReferenceData(),
}, null, 1));

const seen = new Map();

function keysFor(s, legal) {
  const g = s.gameState;
  const keys = [];
  if (g.pending) {
    keys.push(`pending-${g.pending.kind}`);
    if (g.pending.kind === 'roll') keys.push(`roll-${g.pending.reason}`);
    if (g.pending.kind === 'ruin_turn' && g.encounter?.board) {
      if (g.encounter.board.round >= 2) keys.push('ruin-round-2');
      if (legal.some((m) => m.move.type === 'attack')) keys.push('ruin-attack');
      if (legal.some((m) => m.move.type === 'collect_item')) keys.push('ruin-cache');
      if (legal.some((m) => m.move.type === 'recruit_at')) keys.push('ruin-being');
    }
    if (g.pending.kind === 'ruin_setup') keys.push(`ruin-setup-R${g.pending.level}`);
    if (g.pending.kind === 'boarding_decision') keys.push(`boarding-${g.pending.stage}`);
  } else {
    keys.push(`phase-${g.phase}`);
  }
  if (g.encounter?.kind === 'space_combat') keys.push(`combat-${g.encounter.stage}`);
  if (g.phase === 'at_habitat' && !g.pending) keys.push(`habitat-${g.current_habitat}`);
  return keys;
}

function capture(s, key) {
  const legal = game.getLegalMoves(s, 'p1');
  const record = {
    key, viewer: 'p1',
    view: game.getPlayerView(s, 'p1'),
    legalMoves: legal,
    unavailable: greyOf(s, 'p1', legal),
  };
  writeFileSync(join(outDir, `${key}.json`), JSON.stringify(record, null, 1));
}

for (let g = 0; g < games; g++) {
  const players = [{ player_id: 'p1', kind: 'human', name: 'Ressa Vane', table: 'digital' }];
  let s = game.createSession(players, { seed: 4000 + g });
  let plies = 0;
  while (!game.isGameOver(s) && plies < 3000) {
    const legal = game.getLegalMoves(s, 'p1');
    for (const key of keysFor(s, legal)) {
      if (!seen.has(key)) { seen.set(key, true); capture(s, key); }
    }
    if (legal.length === 0) break;
    let move;
    const press = legal.find((m) => m.move.type === 'resolve_report');
    // The ruins and the boarding fights are the rarest moments; take them
    // whenever the engine offers them, so every screen gets captured.
    const eager = legal.find((m) => /^(enter-ruin-1|go-deeper|board-ship|take-ship|attack-|collect-|recruit-at-)/.test(m.move_id) || /^take-mission-h\d-m\d$/.test(m.move_id) && /RUINS/.test(m.description ?? ''));
    if (press) move = press.move;
    else if (eager && !seen.has(`took-${eager.move_id.replace(/-.*$/, '')}-${g}`)) { seen.set(`took-${eager.move_id.replace(/-.*$/, '')}-${g}`, true); move = eager.move; }
    else {
      try { ({ move } = await game.getAIMove(s, 'p1', 'medium')); }
      catch (e) { console.error(`game ${g} ply ${plies}: AI: ${e.message}`); break; }
    }
    try {
      s = game.applyMove(s, 'p1', move).newState;
    } catch (e) {
      console.error(`game ${g} ply ${plies}: ${e.message}`);
      break;
    }
    plies++;
  }
  if (game.isGameOver(s) && !seen.has('phase-game_over')) { seen.set('phase-game_over', true); capture(s, 'phase-game_over'); }
  console.log(`game ${g}: ${plies} plies, over=${!!game.isGameOver(s)}`);
}
console.log([...seen.keys()].sort().join('\n'));
