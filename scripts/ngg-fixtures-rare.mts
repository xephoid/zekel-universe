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

// A robot's look: its Infiltrator-carrying hero is on the activation clock.
{
  const { startBattle } = await import(src + 'engine-battle.ts');
  const s = fx.base2p();
  const g = s.gameState;
  const rob = g.players.find((p: { playerId: string }) => p.playerId === 'rob');
  const wiz = g.players.find((p: { playerId: string }) => p.playerId === 'wiz');
  rob.spyAssignments.push({ source: 'infiltrator', heroId: 'kestrel', active: true });
  wiz.spyAssignments.push({ source: 'illusionist', heroId: 'warden', active: true });
  const spitter = fx.placeUnit(g, 'rob', '0,0', 'spitter');
  g.heroes.find((h: { id: string }) => h.id === 'kestrel').coord = '0,0';
  fx.placeUnit(g, 'wiz', '0,2', 'evoker');
  startBattle(g, rob, '0,0', '0,2', [{ kind: 'unit', id: spitter }, { kind: 'hero', id: 'kestrel' }], []);
  g.battle.phase = 'activations';
  g.battle.activationQueue = ['kestrel', ...g.battle.units.filter((u: { unitRef: string }) => u.unitRef !== 'kestrel').map((u: { unitRef: string }) => u.unitRef)];
  g.battle.activationCursor = 0;
  g.pending = null;
  g.activePlayerId = 'rob';
  writeFileSync(join(outDir, 'battle-activations-infiltrator.json'), JSON.stringify({
    key: 'battle-activations', players: 2, viewer: 'rob',
    view: game.getPlayerView(s, 'rob'), legalMoves: game.getLegalMoves(s, 'rob'),
    watcher: 'wiz', watcherView: game.getPlayerView(s, 'wiz'), watcherLegalMoves: game.getLegalMoves(s, 'wiz'),
  }, null, 1));
  console.log('battle-activations-infiltrator');
}

// Each human picks their own faction: the second human's turn, one taken.
{
  let s = game.createSession([
    { player_id: 'p1', kind: 'human', table: 'digital' }, { player_id: 'p2', kind: 'human', table: 'digital' }, { player_id: 'p3', kind: 'ai' },
  ], { seed: 5, setupFirstPlayerId: 'p1' });
  s = game.applyMove(s, 'p1', { type: 'choose_faction', faction: 'covenant' }).newState;
  write('pending-choose_faction', s);
}

// A claimed hero, owed a base because its owner holds two.
{
  const s = fx.base2p();
  const g = s.gameState;
  fx.placeUnit(g, 'wiz', '0,6', 'evoker');
  g.bases.push({ id: 'base-wiz-2', ownerId: 'wiz', coord: '0,6' });
  g.phase = 'claims';
  g.claimsOwed = { wiz: 1 };
  g.pending = { kind: 'choose_milestone_hero', forPlayerId: 'wiz', claimsOwed: 1 };
  g.activePlayerId = 'wiz';
  const next = game.applyMove(s, 'wiz', { type: 'choose_milestone_hero', hero: 'Chronicler Ottoline Vey' }).newState;
  write('pending-place_reserved_hero', next);
}
