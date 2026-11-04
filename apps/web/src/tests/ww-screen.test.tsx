// Warble Way Galaxy's game-drawn screen (build item 5), against the views the
// engine actually sends (fixtures captured by scripts/ww-fixtures.mjs). Every
// captured moment draws without error and picks the part its board belongs
// to; each part's buttons send only moves the engine listed; the ruin's two
// templates are completed from taps; and nothing is chosen for the captain
// until they tap it.

import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GameReferenceResponse, LegalMove } from '@universe/shared';
import type { GameScreenProps, GlueInput } from '../glue/types';
import { WwScreen, modeOf } from '../glue/ww/WwScreen';
import { readTable } from '../glue/ww/read';
import { GLUES } from '../glue';

afterEach(cleanup);

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/ww');
const REF = JSON.parse(readFileSync(path.resolve(DIR, '../ww-reference.json'), 'utf8')) as GameReferenceResponse;
interface Fixture { key: string; view: unknown; legalMoves: LegalMove[] }
const load = (name: string): Fixture => JSON.parse(readFileSync(path.join(DIR, `${name}.json`), 'utf8')) as Fixture;
const input = (f: Fixture, extra: Partial<GlueInput> = {}): GlueInput => ({
  view: f.view, previous: null, legalMoves: f.legalMoves, playerId: 'p1', reference: REF, seq: 1, engineMove: null, actorPlayerId: null, memory: new Map(), ...extra,
});

function draw(name: string, extra: Partial<GameScreenProps> = {}, inputExtra: Partial<GlueInput> = {}) {
  const f = load(name);
  const onMove = vi.fn(); const onForm = vi.fn(); const onDraw = vi.fn();
  const r = render(<WwScreen input={input(f, inputExtra)} yourTurn busy={false} interactive nameFor={(p) => p} onMove={onMove} onForm={onForm} onDraw={onDraw} {...extra} />);
  return { ...r, f, onMove, onForm, onDraw, moves: f.legalMoves };
}

const EXPECT_MODE: Record<string, string> = {
  'habitat-1': 'habitat', 'habitat-3': 'habitat', 'roll-repair': 'habitat', 'pending-card_draw': 'space', 'pending-hazard_option': 'space', 'roll-hazard_check': 'space',
  'pending-sacrifice_offer': 'space', 'roll-mission_check': 'space', 'pending-space_recruit_offer': 'encounter', 'pending-space_mission_offer': 'encounter', 'pending-ruin_discovery': 'encounter',
  'pending-evade_offer': 'pirate', 'roll-evade': 'pirate', 'combat-choose_action': 'pirate', 'combat-loss_reroll_offer': 'pirate', 'boarding-board_or_leave': 'pirate', 'boarding-take_or_abandon': 'pirate',
  'roll-space_combat': 'pirate', 'roll-ground_combat': 'pirate', 'roll-death_check': 'pirate', 'pending-ruin_setup': 'ruin-setup', 'ruin-setup-R2': 'ruin-setup', 'pending-ruin_continue': 'ruin',
  'pending-ruin_turn': 'ruin', 'ruin-attack': 'ruin', 'ruin-cache': 'ruin', 'ruin-being': 'ruin', 'roll-item_d6': 'ruin', 'roll-recruit': 'ruin', 'phase-game_over': 'over',
};

describe('Warble Way Galaxy screen', () => {
  it('is the glue\'s screen, with a phone layout', () => {
    const g = GLUES['warble-way-galaxy']!;
    expect(g.Screen).toBe(WwScreen);
    expect(g.phone).toBe(true);
  });

  it('draws every captured moment without error, in the part its board belongs to', () => {
    const names = readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
    expect(names.length).toBeGreaterThan(40);
    const errors: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errors.push(String(a[0])); });
    for (const n of names) {
      const f = load(n);
      const table = readTable(f.view, REF);
      if (n === 'phase-creation') { expect(table?.me).toBeNull(); continue; }
      expect(table, n).not.toBeNull();
      if (EXPECT_MODE[n]) expect(modeOf(table!), n).toBe(EXPECT_MODE[n]);
      const r = render(<WwScreen input={input(f)} yourTurn busy={false} interactive nameFor={(p) => p} onMove={() => {}} onForm={() => {}} />);
      expect(r.container.querySelector('.ww-screen'), n).not.toBeNull();
      cleanup();
      const p = render(<WwScreen input={input(f, { phone: true })} yourTurn busy={false} interactive nameFor={(p) => p} onMove={() => {}} onForm={() => {}} phone />);
      expect(p.container.querySelector('.ww-phone'), `${n} on a phone`).not.toBeNull();
      cleanup();
    }
    spy.mockRestore();
    expect(errors.filter((e) => !/act\(/.test(e))).toEqual([]);
  });

  it('at a habitat, the rows and the visit buttons send the listed moves and nothing else', () => {
    const { onMove, moves, container } = draw('habitat-1');
    fireEvent.click(screen.getByRole('button', { name: /^Hydroponics Mold/ }));
    expect(onMove).toHaveBeenLastCalledWith(moves.find((m) => m.move_id === 'take-mission-h1-m1'));
    // No one aboard has DIP: the row is drawn but cannot be pressed.
    const squabble = screen.getByRole('button', { name: /^Scrapyard Squabble/ });
    expect((squabble as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /^Sustenance Cube/ }));
    expect(onMove).toHaveBeenLastCalledWith(moves.find((m) => m.move_id === 'buy-h1-s1'));
    expect((screen.getByRole('button', { name: /^WinchesterZhang Plinker/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /^Wang/ }));
    expect(onMove).toHaveBeenLastCalledWith(moves.find((m) => m.move_id === 'recruit-h1-c1'));
    fireEvent.click(screen.getByRole('button', { name: /Pay for repair/ }));
    expect(onMove).toHaveBeenLastCalledWith(moves.find((m) => m.move_id === 'pay-repair'));
    expect((screen.getByRole('button', { name: /Repair roll/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /^DEPART$/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector('.ww-hab-title')!.textContent).toBe('Xaxalon 4');
    expect(onMove).toHaveBeenCalledTimes(4);
  });

  it('a hazard offers the engine\'s options and the roll panel presses the table\'s Roll', () => {
    const h = draw('pending-hazard_option');
    const [one, two] = h.container.querySelectorAll('.ww-option');
    expect(one!.textContent).toContain('DIP 10');
    expect(two!.textContent).toContain('DEM 15');
    fireEvent.click(two!);
    expect(h.onMove).toHaveBeenLastCalledWith(h.moves.find((m) => m.move_id === 'hazard-option-2'));
    cleanup();
    const r = draw('roll-hazard_check');
    expect(r.container.querySelector('.ww-roll-text')!.textContent).toContain('You need 15 or more, adding your own Research +1');
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }));
    expect(r.onDraw).toHaveBeenCalledTimes(1);
    expect(r.onMove).not.toHaveBeenCalled();
    cleanup();
    const d = draw('pending-card_draw');
    fireEvent.click(screen.getByRole('button', { name: 'Draw' }));
    expect(d.onDraw).toHaveBeenCalledTimes(1);
    cleanup();
    const s = draw('pending-sacrifice_offer');
    fireEvent.click(screen.getByRole('button', { name: 'SPEND A RED SHIRT' }));
    expect(s.onMove).toHaveBeenLastCalledWith(s.moves.find((m) => m.move_id === 'sacrifice-unnamed'));
  });

  it('an encounter names the card and sends the listed answer', () => {
    const r = draw('pending-space_recruit_offer');
    expect(r.container.querySelector('.ww-h1')!.textContent).toBe('Katie is hailing you');
    fireEvent.click(screen.getByRole('button', { name: /Try to recruit/ }));
    expect(r.onMove).toHaveBeenLastCalledWith(r.moves.find((m) => m.move_id === 'attempt-space-recruit'));
    cleanup();
    const m = draw('pending-space_mission_offer');
    // Neither way is listed (no one aboard has the ability): both are drawn off; only Decline sends.
    expect((screen.getByRole('button', { name: /Way 1: DIP 10/ }) as HTMLButtonElement).disabled).toBe(true);
    // The open move list under the screen lists the same move in the engine's words; the card's own button is in the main card.
    fireEvent.click(within(m.container.querySelector('.ww-main-card')!).getByRole('button', { name: /^Decline/ }));
    expect(m.onMove).toHaveBeenLastCalledWith(m.moves.find((x) => x.move_id === 'decline-mission'));
    cleanup();
    const d = draw('pending-ruin_discovery');
    expect(screen.queryByRole('button', { name: /Enter · depth 3/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Enter · depth 2/ }));
    expect(d.onMove).toHaveBeenLastCalledWith(d.moves.find((x) => x.move_id === 'enter-ruin-2'));
  });

  it('the pirate fight greys the actions the engine did not list and sends the ones it did', () => {
    const c = draw('combat-choose_action');
    const main = within(c.container.querySelector('.ww-main-card')!);
    expect((main.getByRole('button', { name: /^Hack/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((main.getByRole('button', { name: /^Intimidate/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(main.getByRole('button', { name: /^Redline/ }));
    expect(c.onMove).toHaveBeenLastCalledWith(c.moves.find((m) => m.move_id === 'redline'));
    fireEvent.click(main.getByRole('button', { name: /^Fight/ }));
    expect(c.onMove).toHaveBeenLastCalledWith(c.moves.find((m) => m.move_id === 'fight-round'));
    expect(c.container.querySelector('.ww-pirate-card')).not.toBeNull();
    cleanup();
    const e = draw('pending-evade_offer');
    expect(e.container.querySelector('.ww-pirate-card')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Run silent/ }));
    expect(e.onMove).toHaveBeenLastCalledWith(e.moves.find((m) => m.move_id === 'attempt-evade'));
    cleanup();
    const b = draw('boarding-take_or_abandon');
    fireEvent.click(screen.getByRole('button', { name: 'TAKE THE SHIP' }));
    expect(b.onMove).toHaveBeenLastCalledWith(b.moves.find((m) => m.move_id === 'take-ship'));
    fireEvent.click(screen.getByRole('button', { name: /^KEEP / }));
    expect(b.onMove).toHaveBeenLastCalledWith(b.moves.find((m) => m.move_id === 'abandon-ship'));
  });

  it('ruin setup fills the engine\'s template from taps, and nothing is chosen until the captain taps', () => {
    const r = draw('pending-ruin_setup');
    const enter = screen.getByRole('button', { name: 'ENTER R1' });
    expect((enter as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /Bot Pilot \(you\)/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Threat 2' }));
    fireEvent.click(screen.getByRole('button', { name: /^Row 9 · col 9/ }));
    const spots = r.container.querySelectorAll('button.ww-cell.spot-unused, button.ww-cell[aria-label*="attacker spot"]');
    expect(spots.length).toBeGreaterThanOrEqual(3);
    fireEvent.click(spots[0]!); fireEvent.click(spots[1]!); fireEvent.click(spots[2]!);
    expect((enter as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(enter);
    const template = r.moves.find((m) => m.move_id === 'setup-encounter')!;
    expect(r.onForm).toHaveBeenCalledTimes(1);
    const [t, move, keys] = r.onForm.mock.calls[0] as [LegalMove, Record<string, unknown>, string[]];
    expect(t).toBe(template);
    expect(keys).toEqual(['crew_names', 'include_character', 'start_location', 'threat_level', 'attacker_placements']);
    expect(move).toMatchObject({ type: 'setup_encounter', include_character: true, crew_names: [], start_location: 'r9c9', threat_level: 2 });
    expect((move['attacker_placements'] as string[]).length).toBe(3);
    for (const c of move['attacker_placements'] as string[]) expect(c).toMatch(/^r\dc\d$/);
  });

  it('a ruin round: a tap on a floor square completes the acting being\'s move, the actions send listed moves', () => {
    const r = draw('ruin-attack');
    // The acting being is the one with moves (the others are done).
    expect(r.container.querySelector('.ww-party-row.acting')!.textContent).toContain('Kralkin');
    fireEvent.click(screen.getByRole('button', { name: /^Attack a2/ }));
    expect(r.onMove).toHaveBeenLastCalledWith(r.moves.find((m) => m.move_id === 'attack-Kralkin (GUN+2 SWA+2)-A2'));
    const floor = r.container.querySelector('button.ww-cell[data-cell="r7c4"]')!;
    fireEvent.click(floor);
    const template = r.moves.find((m) => m.move_id === 'move-Kralkin (GUN+2 SWA+2)')!;
    expect(r.onForm).toHaveBeenLastCalledWith(template, { ...template.move, to: 'r7c4' }, ['to']);
    // A wall and an occupied square are not tappable.
    expect(r.container.querySelector('button.ww-cell[data-cell="r2c2"]')).toBeNull();
    expect(r.container.querySelector('button.ww-cell[data-cell="r3c3"]')).toBeNull();
    expect((screen.getByRole('button', { name: /Open a cache/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /^End Kralkin/ }));
    expect(r.onMove).toHaveBeenLastCalledWith(r.moves.find((m) => m.move_id === 'end-Kralkin (GUN+2 SWA+2)'));
    cleanup();
    const c = draw('pending-ruin_continue');
    fireEvent.click(screen.getByRole('button', { name: 'GO DEEPER' }));
    expect(c.onMove).toHaveBeenLastCalledWith(c.moves.find((m) => m.move_id === 'go-deeper'));
  });

  it('level up, over capacity and the departure peek are overlays that send listed moves', () => {
    const l = draw('pending-level_up');
    fireEvent.click(screen.getByRole('button', { name: /^Mechanics, 2 to 3/ }));
    expect(l.onMove).toHaveBeenLastCalledWith(l.moves.find((m) => m.move_id === 'level-up-MEC'));
    fireEvent.click(screen.getByRole('button', { name: /^Sneaking, open at 1/ }));
    expect(l.onMove).toHaveBeenLastCalledWith(l.moves.find((m) => m.move_id === 'level-up-open-SNE'));
    cleanup();
    const rel = draw('pending-release_crew');
    const dialog = screen.getByRole('dialog', { name: 'Release crew' });
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'RELEASE' })[2]!);
    expect(rel.onMove).toHaveBeenLastCalledWith(rel.moves.find((m) => m.move_id === 'release-Grull (HAK+3)'));
    cleanup();
    const peek = draw('pending-res_discard');
    fireEvent.click(screen.getByRole('button', { name: 'DISCARD IT' }));
    const template = peek.moves.find((m) => m.move_id === 'report-res-discard')!;
    expect(peek.onForm).toHaveBeenLastCalledWith(template, { ...template.move, card: '4S' }, ['card']);
    fireEvent.click(screen.getByRole('button', { name: /LEAVE IT ON TOP/ }));
    expect(peek.onMove).toHaveBeenLastCalledWith(peek.moves.find((m) => m.move_id === 'skip-res-peek'));
  });

  it('a watcher can press nothing', () => {
    const r = draw('habitat-1', { interactive: false, yourTurn: false });
    for (const b of r.container.querySelectorAll('button.ww-mrow, button.ww-visit-btn, button.ww-gold-btn')) expect((b as HTMLButtonElement).disabled).toBe(true);
  });

  it('the glue\'s forms complete the ruin templates in words, for the menu', () => {
    const g = GLUES['warble-way-galaxy']!;
    const f = load('pending-ruin_setup');
    const form = g.formFor!(f.legalMoves[0]!, input(f))!;
    expect(form.fields.map((x) => x.key)).toEqual(['include_character', 'start_location', 'threat_level', 'attacker_placements']);
    expect(form.build({ include_character: 'yes', start_location: 'r9c1', threat_level: '1', attacker_placements: ['r1c2', 'r1c9'] })).toBeNull();
    expect(form.build({ include_character: 'yes', start_location: 'r9c1', threat_level: '1', attacker_placements: ['r1c2', 'r1c9', 'r2c1'] }))
      .toMatchObject({ type: 'setup_encounter', include_character: true, crew_names: [], start_location: 'r9c1', threat_level: 1, attacker_placements: ['r1c2', 'r1c9', 'r2c1'] });
    const a = load('ruin-attack');
    const mv = a.legalMoves.find((m) => m.move['type'] === 'move_being')!;
    const mf = g.formFor!(mv, input(a))!;
    expect(mf.build({ to: 'R7C4' })).toMatchObject({ type: 'move_being', to: 'r7c4' });
    expect(mf.build({ to: 'nowhere' })).toBeNull();
  });
});
