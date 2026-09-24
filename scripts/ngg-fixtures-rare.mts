// The pendings a seeded AI game rarely reaches, captured from the engine's own
// hand-built states (its __tests__/pendingFixtures.ts), in the same shape as
// scripts/ngg-fixtures.mjs writes. Run from a zekel checkout with tsx:
//
//   npx tsx <universe>/scripts/ngg-fixtures-rare.mts <universe>
//
// (tsx resolves the engine's TypeScript sources relative to the cwd.)

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const universe = resolve(process.argv[2] ?? '.');
const src = pathToFileURL(resolve('src/games/neither-guts-nor-gears/')).href + '/';
const fx = await import(src + '__tests__/pendingFixtures.ts');
const game = (await import(src + 'index.ts')).default;
const outDir = join(universe, 'apps/web/src/tests/fixtures/ngg');
mkdirSync(outDir, { recursive: true });

function write(name: string, s: { players: Array<{ player_id: string }>; gameState: { pending: { kind: string; forPlayerId: string } | null } }) {
  const who = s.gameState.pending!.forPlayerId;
  const watcher = s.players.map((p) => p.player_id).find((id) => id !== who)!;
  writeFileSync(join(outDir, `${name}.json`), JSON.stringify({
    key: `pending-${s.gameState.pending!.kind}`,
    players: s.players.length,
    viewer: who,
    view: game.getPlayerView(s, who),
    legalMoves: game.getLegalMoves(s, who),
    watcher,
    watcherView: game.getPlayerView(s, watcher),
    watcherLegalMoves: game.getLegalMoves(s, watcher),
  }, null, 1));
  console.log(name, s.gameState.pending!.kind);
}

write('pending-battle_defense-decoy', fx.battleDefense('decoy', 5).s);
write('pending-battle_defense-mana_shield', fx.battleDefense('mana_shield', 5).s);
write('pending-battle_defense-cleric', fx.battleDefense('cleric', 5).s);
write('pending-battle_commit-shared_tactics', fx.commitOwnerFirst().s);
write('pending-battle_commit-reserved', fx.commitReserved().s);
write('pending-treaty_break_decision-blocked', fx.sharedResourcesBlocked().s);
write('pending-access_request-queue', fx.accessRequest().s);
write('pending-counter_target-batches', fx.counterTarget().s);
write('pending-extra_selection-shut', fx.extraSelection().s);
