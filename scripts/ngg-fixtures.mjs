// Captures real Neither Guts nor Gears views from the engine, one per screen
// the client routes to, so the table's tests read what the engine actually
// sends rather than a hand-written guess.
//
//   node scripts/ngg-fixtures.mjs <path to a built zekel checkout> [games]
//
// It plays seeded games in-process (every seat driven by the engine's own AI)
// and, the first time each pending kind, battle phase, phase or active action
// appears, records the deciding seat's view and legal moves and one other
// seat's view. Output: apps/web/src/tests/fixtures/ngg/*.json

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const engineRoot = resolve(process.argv[2] ?? '../zekel');
const games = Number(process.argv[3] ?? 12);
const mod = await import(pathToFileURL(join(engineRoot, 'dist/games/neither-guts-nor-gears/index.js')).href);
const game = new mod.NeitherGutsNorGearsGame();

const outDir = resolve('apps/web/src/tests/fixtures/ngg');
mkdirSync(outDir, { recursive: true });

// The printed catalogue, in the shape the server's reference endpoint returns.
writeFileSync(resolve('apps/web/src/tests/fixtures/ngg-reference.json'), JSON.stringify({
  gameId: 'neither-guts-nor-gears', rules: game.getRulesText(), moveSchema: game.moveSchema,
  optionsSchema: game.optionsSchema, referenceData: game.getReferenceData(),
}, null, 1));

const seen = new Map();
const factionsWizardFirst = ['covenant', 'foundry', 'schism', 'ledger', 'brass-circle', 'unbolted'];

function keyFor(s) {
  const g = s.gameState;
  if (g.pending) return `pending-${g.pending.kind}`;
  if (g.battle && g.battle.phase !== 'done') return `battle-${g.battle.phase}`;
  if (g.phase === 'action' && g.activeAction) return `action-${g.activeAction.cardKind}`;
  return `phase-${g.phase}`;
}

function capture(s, key, who) {
  const others = s.players.map((p) => p.player_id).filter((id) => id !== who);
  const record = {
    key,
    players: s.players.length,
    viewer: who,
    view: game.getPlayerView(s, who),
    legalMoves: game.getLegalMoves(s, who),
    watcher: others[0],
    watcherView: game.getPlayerView(s, others[0]),
    watcherLegalMoves: game.getLegalMoves(s, others[0]),
  };
  writeFileSync(join(outDir, `${key}${s.players.length === 2 ? '' : `-${s.players.length}p`}.json`), JSON.stringify(record, null, 1));
}

for (let g = 0; g < games; g++) {
  const n = [2, 4, 3, 6][g % 4];
  const players = Array.from({ length: n }, (_, i) => ({
    player_id: `p${i + 1}`, kind: i === 0 ? 'human' : 'ai', table: 'digital', difficulty: 'medium',
  }));
  let s = game.createSession(players, { seed: 1000 + g });
  // The faction pick, as Universe's setup page sends it.
  const selections = Object.fromEntries(players.map((p, i) => [p.player_id, factionsWizardFirst[(i + g) % 6]]));
  s = game.applyMove(s, 'p1', { type: 'assign_setup_choices', selections }).newState;
  let plies = 0;
  while (!game.isGameOver(s) && plies < 4000) {
    const pend = s.gameState.pending;
    const who = pend ? pend.forPlayerId : s.gameState.activePlayerId;
    const key = keyFor(s);
    const tag = `${key}|${n === 2 ? 2 : 'n'}`;
    if (!seen.has(tag)) { seen.set(tag, true); capture(s, key, who); }
    const legal = game.getLegalMoves(s, who);
    if (legal.length === 0) break;
    const { move } = await game.getAIMove(s, who, 'medium');
    try {
      s = game.applyMove(s, who, move).newState;
    } catch (e) {
      console.error(`game ${g} ply ${plies}: ${e.message}`);
      break;
    }
    plies++;
  }
  if (game.isGameOver(s) && !seen.has('phase-game_over')) {
    seen.set('phase-game_over', true);
    capture(s, 'phase-game_over', 'p1');
  }
  console.log(`game ${g} (${n}p): ${plies} plies, over=${!!game.isGameOver(s)}`);
}
console.log([...seen.keys()].sort().join('\n'));
