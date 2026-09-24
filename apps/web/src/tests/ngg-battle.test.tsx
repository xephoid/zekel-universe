// The NGnG battle screens, drawn from views the engine produced: shut options
// carry the engine's reason, a press sends only a move the engine listed (or
// a listed template with only its editable keys changed), nothing is sent
// without a press, and a watching seat has no live control.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import type { GameReferenceResponse, LegalMove } from '@universe/shared';
import type { GlueInput } from '../glue';
import { isSubmissionAllowed } from '../glue/agency';
import { NggScreen } from '../glue/ngg/NggScreen';
import REFERENCE from './fixtures/ngg-reference.json';

interface Fixture {
  key: string;
  viewer: string;
  view: unknown;
  legalMoves: LegalMove[];
  watcher: string;
  watcherView: unknown;
  watcherLegalMoves: LegalMove[];
}

const ALL = Object.fromEntries(
  Object.entries(import.meta.glob<Fixture>('./fixtures/ngg/*.json', { eager: true, import: 'default' }))
    .map(([path, f]) => [path.replace(/^.*\//, '').replace(/\.json$/, ''), f]),
);

const BATTLE_FIXTURES = [
  'action-move_battle', 'action-move_battle-multi', 'pending-elara_spell', 'pending-elara_spell-multi',
  'pending-battle_commit-multi', 'pending-battle_commit-shared_tactics', 'pending-battle_commit-reserved',
  'pending-counter_target-batches', 'pending-extra_selection-multi', 'pending-extra_selection-shut',
  'battle-activations-multi', 'battle-activations-infiltrator',
  'pending-battle_defense-decoy', 'pending-battle_defense-mana_shield', 'pending-battle_defense-cleric',
  'pending-retreat-multi', 'pending-rally_selection-multi',
];

// Views whose exact content these tests assert (fixtures/ngg-pinned/README.md).
const PINNED = Object.fromEntries(
  Object.entries(import.meta.glob<Fixture>('./fixtures/ngg-pinned/*.json', { eager: true, import: 'default' }))
    .map(([path, f]) => [`pinned:${path.replace(/^.*\//, '').replace(/\.json$/, '')}`, f]),
);

function fx(name: string): Fixture {
  const f = ALL[name] ?? PINNED[name];
  if (!f) throw new Error(`no fixture ${name}`);
  return f;
}

function mount(view: unknown, playerId: string, legalMoves: LegalMove[], yourTurn = true) {
  const onMove = vi.fn();
  const onForm = vi.fn();
  const input: GlueInput = {
    view, previous: null, legalMoves, playerId, reference: REFERENCE as GameReferenceResponse, seq: 1,
    engineMove: null, actorPlayerId: null, memory: new Map(),
  };
  const r = render(<NggScreen input={input} yourTurn={yourTurn} busy={false} interactive onMove={onMove} onForm={onForm} nameFor={(p) => p} />);
  return { ...r, onMove, onForm, legalMoves };
}

function decider(name: string) {
  const f = fx(name);
  return mount(f.view, f.viewer, f.legalMoves);
}

/** The enabled button whose text contains `text`. */
function press(root: HTMLElement, text: string | RegExp) {
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('button:not([data-view-only])')].filter((b) => !b.disabled);
  const hit = buttons.find((b) => (typeof text === 'string' ? b.textContent?.includes(text) : text.test(b.textContent ?? '')));
  if (!hit) throw new Error(`no enabled button with "${String(text)}" among: ${buttons.map((b) => b.textContent).join(' | ')}`);
  fireEvent.click(hit);
}

function sentListed(onMove: ReturnType<typeof vi.fn>, legalMoves: LegalMove[]) {
  expect(onMove).toHaveBeenCalledTimes(1);
  const sent = onMove.mock.calls[0]![0] as LegalMove;
  expect(isSubmissionAllowed('tap', sent.move, legalMoves)).toBe(true);
  return sent.move;
}

afterEach(() => cleanup());

describe('NGnG battle screens', () => {
  for (const name of BATTLE_FIXTURES) {
    it(`${name}: a watcher sees the same surface with no live control, and nothing is sent unasked`, () => {
      const f = fx(name);
      const a = mount(f.view, f.viewer, f.legalMoves);
      expect(a.container.querySelector('.ngg-panel')).not.toBeNull();
      cleanup();
      const w = mount(f.watcherView, f.watcher, f.watcherLegalMoves, false);
      const column = w.container.querySelector('.ngg-column')!;
      const live = [...column.querySelectorAll<HTMLButtonElement>('button:not([data-view-only])')].filter((b) => !b.disabled);
      expect(live).toHaveLength(0);
      expect(w.container.querySelectorAll('button.ngg-hex')).toHaveLength(0);
      expect(w.container.querySelector('.ngg-interrupt')).toBeNull();
      expect(a.onMove).not.toHaveBeenCalled();
      expect(w.onMove).not.toHaveBeenCalled();
      expect(w.onForm).not.toHaveBeenCalled();
    });
  }

  it('Battle Commit: nothing goes until Commit, then the listed card', () => {
    const r = decider('pinned:pending-battle_commit-4p');
    expect(r.container.textContent).toContain('Commit one card, face down — or none');
    const commit = [...r.container.querySelectorAll('button')].find((b) => b.textContent === 'Commit')!;
    expect(commit.disabled).toBe(true);
    press(r.container, 'Counter a battle strategy card');
    expect(r.onMove).not.toHaveBeenCalled();
    press(r.container, 'Commit Counter');
    expect(sentListed(r.onMove, r.legalMoves)).toEqual({ type: 'commit_battle_card', card: 'Counter' });
  });

  it('Battle Commit: a card already committed is shut with the engine\'s reason', () => {
    const r = decider('pending-battle_commit-reserved');
    expect(r.container.textContent).toContain('That Bonus (+1 DMG to all your units) is already committed this battle');
    press(r.container, 'No card');
    press(r.container, 'Commit no card');
    expect(sentListed(r.onMove, r.legalMoves)).toEqual({ type: 'commit_battle_card', card: null });
  });

  it('Shared Tactics: the partner\'s hand is shut by the engine\'s gate, named by faction', () => {
    const r = decider('pending-battle_commit-shared_tactics');
    const text = r.container.textContent ?? '';
    expect(text).toContain('The Ledger is in this battle and has not committed yet');
    expect(text).not.toMatch(/\brob is in this battle/);
    expect(text).toContain('Your hand');
    press(r.container, 'Retreat');
    press(r.container, 'Commit Retreat');
    expect(sentListed(r.onMove, r.legalMoves)).toEqual({ type: 'commit_battle_card', card: 'Retreat' });
  });

  it('Card Batch: shut targets carry their reasons; an open one is sent on confirm', () => {
    const r = decider('pending-counter_target-batches');
    const text = r.container.textContent ?? '';
    expect(text).toContain('A Counter cannot target itself');
    expect(text).toContain('That Retreat has already resolved');
    press(r.container, /^Battle cardRally/);
    expect(r.onMove).not.toHaveBeenCalled();
    press(r.container, "Counter The Ledger's Rally");
    expect(sentListed(r.onMove, r.legalMoves)).toEqual({ type: 'choose_counter_target', card: 'Rally' });
  });

  it('Card Batch: the engine never asks for a Counter with nothing it may cancel', () => {
    // A Counter with no open target resolves by itself in the engine; every
    // captured Counter decision has at least one target to press.
    const counters = Object.values(ALL).filter((f) => f.key === 'pending-counter_target');
    expect(counters.length).toBeGreaterThan(0);
    for (const f of counters) {
      const options = (f.view as { pending: { options: Array<{ move?: unknown }> } }).pending.options;
      expect(options.some((o) => o.move)).toBe(true);
      expect(f.legalMoves.length).toBeGreaterThan(0);
    }
  });

  it('Battle Extra: two picks send the listed pair; Add none sends the listed empty pick', () => {
    const r = decider('pending-extra_selection-shut');
    press(r.container, /^Battle cardRetreat/);
    press(r.container, /^Battle cardBonus/);
    expect(r.container.textContent).toContain('2 of 2 chosen');
    expect(r.onMove).not.toHaveBeenCalled();
    press(r.container, 'Reveal both together');
    const move = sentListed(r.onMove, r.legalMoves);
    expect(move['type']).toBe('select_extra_cards');
    expect([...(move['cards'] as string[])].sort()).toEqual(['Bonus (+1 DMG to all your units)', 'Retreat']);
    cleanup();
    const n = decider('pending-extra_selection-multi');
    press(n.container, 'Add none');
    expect(sentListed(n.onMove, n.legalMoves)).toEqual({ type: 'select_extra_cards', cards: [] });
  });

  it('Battle Activation: action, then target, then the listed move; Pass is its own press', () => {
    const r = decider('battle-activations-infiltrator');
    expect(r.container.textContent).toContain('Kestrel Nine activates');
    press(r.container, /^Attack/);
    press(r.container, 'Evoker');
    expect(r.onMove).not.toHaveBeenCalled();
    press(r.container, /^Attack .*Evoker/);
    expect(sentListed(r.onMove, r.legalMoves)).toEqual({ type: 'battle_activation', unit: 'kestrel', action: { kind: 'attack', target: 'u-evoker-wiz-1' } });
    cleanup();
    const p = decider('battle-activations-infiltrator');
    press(p.container, 'Pass the activation');
    expect(sentListed(p.onMove, p.legalMoves)).toEqual({ type: 'battle_activation', unit: 'kestrel', action: { kind: 'pass' } });
  });

  it("Robot Infiltrator: the look is its own control, and sends the engine's listed move", () => {
    const r = decider('battle-activations-infiltrator');
    const look = r.legalMoves.find((m) => m.move['type'] === 'use_detection')!;
    expect(look).toBeTruthy();
    const buttons = [...r.container.querySelectorAll('button')].filter((b) => !b.disabled && /Detection|Look/i.test(b.textContent ?? ''));
    expect(buttons.length).toBeGreaterThan(0);
    fireEvent.click(buttons[buttons.length - 1]!);
    // One press may pick the seat, a second confirms; either way only the listed look goes out.
    const confirm = [...r.container.querySelectorAll('button')].filter((b) => !b.disabled && /^(Look|Inspect|Use Detection)/i.test(b.textContent ?? ''));
    if (r.onMove.mock.calls.length === 0 && confirm.length) fireEvent.click(confirm[0]!);
    expect(sentListed(r.onMove, r.legalMoves)).toEqual(look.move);
  });

  it('Battle Defense: drawn as an interrupt; shut defenses carry reasons; a shield is sent on confirm', () => {
    const d = decider('pending-battle_defense-decoy');
    const dialog = d.container.querySelector('.ngg-interrupt') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain('No unrevealed spy rides that hero');
    expect(dialog.textContent).toContain('The Mana Shield window is not open on this attack');
    cleanup();
    const r = decider('pending-battle_defense-mana_shield');
    const box = r.container.querySelector('.ngg-interrupt') as HTMLElement;
    expect(box.textContent).toContain('Spitter Platform attacks Evoker');
    press(box, 'Mana Shield — spend 3 mana');
    expect(r.onMove).not.toHaveBeenCalled();
    within(box).getAllByRole('button');
    const confirm = [...box.querySelectorAll('button.ngg-btn.primary')][0] as HTMLButtonElement;
    fireEvent.click(confirm);
    expect(sentListed(r.onMove, r.legalMoves)).toEqual({ type: 'resolve_battle_defense', defense: { kind: 'mana_shield', mana: 3 } });
    cleanup();
    const c = decider('pending-battle_defense-cleric');
    press(c.container, 'Decline');
    expect(sentListed(c.onMove, c.legalMoves)).toEqual({ type: 'resolve_battle_defense', defense: { kind: 'none' } });
  });

  it('Retreat: a lit tile, then Retreat to it; Stay in is its own press', () => {
    const r = decider('pending-retreat-multi');
    const tiles = r.container.querySelectorAll('button.ngg-hex');
    expect(tiles).toHaveLength(r.legalMoves.filter((m) => m.move['destination']).length);
    fireEvent.click(tiles[0]!);
    expect(r.onMove).not.toHaveBeenCalled();
    press(r.container, /^Retreat to /);
    const move = sentListed(r.onMove, r.legalMoves);
    expect(move['type']).toBe('choose_retreat');
    cleanup();
    const s = decider('pending-retreat-multi');
    press(s.container, 'Stay in');
    expect(sentListed(s.onMove, s.legalMoves)).toEqual({ type: 'choose_retreat', destination: null, stay: true });
  });

  it('Rally: Bring nobody sends the listed empty move', () => {
    const r = decider('pending-rally_selection-multi');
    press(r.container, 'Bring nobody');
    expect(sentListed(r.onMove, r.legalMoves)).toEqual({ type: 'select_rally_units', units: [] });
  });

  it('Rally: a subset the engine did not list whole is a listed template with only units changed', () => {
    const f = fx('pending-rally_selection-multi');
    const legal: LegalMove[] = [
      ...f.legalMoves,
      { move_id: '', description: 'x', move: { type: 'select_rally_units', units: ['u-water-collector-p1'] } },
      { move_id: '', description: 'y', move: { type: 'select_rally_units', units: ['u-wood-collector-p1'] } },
      { move_id: '', description: 'z', move: { type: 'select_rally_units', units: ['u-ore-collector-p1-1'] } },
      { move_id: '', description: 'all', move: { type: 'select_rally_units', units: ['u-water-collector-p1', 'u-wood-collector-p1', 'u-ore-collector-p1-1'] } },
    ];
    const r = mount(f.view, f.viewer, legal);
    press(r.container, 'Water collector');
    press(r.container, 'Wood collector');
    press(r.container, 'Bring 2');
    expect(r.onMove).not.toHaveBeenCalled();
    expect(r.onForm).toHaveBeenCalledTimes(1);
    const [template, move, keys] = r.onForm.mock.calls[0]! as [LegalMove, Record<string, unknown>, string[]];
    expect(isSubmissionAllowed('form', move, legal, { template: template.move, editableKeys: keys })).toBe(true);
    expect(move['units']).toEqual(['u-water-collector-p1', 'u-wood-collector-p1']);
  });

  it('Move Battle: from, to, then the listed move; Skip is its own press', () => {
    const r = decider('action-move_battle-multi');
    expect(r.onMove).not.toHaveBeenCalled();
    // Stage one: the origin stacks are lit.
    let tiles = r.container.querySelectorAll('button.ngg-hex');
    expect(tiles).toHaveLength(1);
    fireEvent.click(tiles[0]!);
    tiles = r.container.querySelectorAll('button.ngg-hex');
    expect(tiles).toHaveLength(3);
    fireEvent.click(tiles[0]!);
    expect(r.onMove).not.toHaveBeenCalled();
    press(r.container, /^Move to /);
    const move = sentListed(r.onMove, r.legalMoves);
    expect(move['type']).toBe('move_units');
    cleanup();
    const s = decider('action-move_battle-multi');
    press(s.container, 'Skip this action');
    expect(sentListed(s.onMove, s.legalMoves)).toEqual({ type: 'skip_action' });
  });

  it('Move Battle: leaving a unit behind sends the listed template with only units changed', () => {
    const f = fx('action-move_battle');
    const legal = f.legalMoves.map((m) => (m.move['type'] === 'move_units'
      ? { ...m, move: { ...m.move, units: ['motherboard', 'u-water-collector-p2'] } }
      : m));
    const r = mount(f.view, f.viewer, legal);
    fireEvent.click(r.container.querySelector('button.ngg-hex')!);
    fireEvent.click(r.container.querySelectorAll('button.ngg-hex')[0]!);
    press(r.container, 'Water collector');
    press(r.container, /^Move to /);
    expect(r.onMove).not.toHaveBeenCalled();
    const [template, move, keys] = r.onForm.mock.calls[0]! as [LegalMove, Record<string, unknown>, string[]];
    expect(keys).toEqual(['units']);
    expect(isSubmissionAllowed('form', move, legal, { template: template.move, editableKeys: keys })).toBe(true);
    expect(move['units']).toEqual(['motherboard']);
  });

  it("Elara's spell: a lit tile then Cast, or Do not cast", () => {
    const r = decider('pending-elara_spell');
    const tiles = r.container.querySelectorAll('button.ngg-hex');
    expect(tiles).toHaveLength(3);
    fireEvent.click(tiles[1]!);
    expect(r.onMove).not.toHaveBeenCalled();
    press(r.container, /^Cast at /);
    expect(sentListed(r.onMove, r.legalMoves)['type']).toBe('cast_elara_spell');
    cleanup();
    const s = decider('pending-elara_spell');
    press(s.container, 'Do not cast');
    expect(sentListed(s.onMove, s.legalMoves)).toEqual({ type: 'cast_elara_spell', target_location: null, skip: true });
  });
});
