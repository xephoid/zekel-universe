// A game whose screen has moved to its own package (zekel-games) is installed
// from npm and reached through the list, like any other. The screen's own
// tests live with the game. This checks the join: the list holds the
// package's glue, and its screen draws here, through this app's build, from
// a view the engine produced.

import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GlueInput, LegalMove } from '@zekel/glue-kit';
import type { MapData } from '@zekel/primitives';
import { GLUES, glueFor } from '../glue';
import { CN_REFERENCE, CN_VIEW } from './fixtures/installed/cybernoir-2127';

afterEach(cleanup);

const here = path.dirname(fileURLToPath(import.meta.url));
const captured = JSON.parse(readFileSync(path.join(here, 'fixtures', 'installed', 'word-debauchee-build-rows.json'), 'utf8')) as { viewer: string; view: unknown; legalMoves: LegalMove[] };

describe('an installed game', () => {
  it('is in the list under its engine id, with what a glue must have', () => {
    const glue = glueFor('word-debauchee');
    expect(glue).toBe(GLUES['word-debauchee']);
    expect(typeof glue?.setupFields).toBe('function');
    expect(typeof glue?.resolveReportMove).toBe('function');
    expect(glue?.Screen).toBeTypeOf('function');
  });

  it('draws its screen from a captured view and sends nothing on its own', () => {
    const Screen = glueFor('word-debauchee')!.Screen!;
    const onMove = vi.fn(); const onForm = vi.fn();
    const input: GlueInput = { view: captured.view, previous: null, legalMoves: captured.legalMoves, playerId: captured.viewer, reference: null, seq: 1, engineMove: null, actorPlayerId: null, memory: new Map() };
    const { container } = render(<Screen input={input} yourTurn busy={false} interactive nameFor={(p) => p} onMove={onMove} onForm={onForm} />);
    expect(container.querySelector('[data-row]')).not.toBeNull();
    expect(container.querySelectorAll('[data-key]').length).toBeGreaterThan(20);
    expect(onMove).not.toHaveBeenCalled();
    expect(onForm).not.toHaveBeenCalled();
  });

  it('lays out a plan-drawn game from a view: Cybernoir 2127', () => {
    const glue = glueFor('cybernoir-2127')!;
    expect(glue).toBe(GLUES['cybernoir-2127']);
    const input: GlueInput = { view: CN_VIEW, previous: null, legalMoves: [], playerId: 'hak', reference: CN_REFERENCE, seq: 1, engineMove: null, actorPlayerId: null, memory: new Map() };
    expect(glue.themeFor!(input)).toBe('cn-theme cn-theme-hacker');
    const plan = glue.plan(input)!;
    const map = plan.board.find((z) => z.kind === 'map')!.data as MapData;
    expect(map.nodes.length).toBeGreaterThan(0);
    expect(map.nodes.every((n) => n.id.startsWith('cn:loc:'))).toBe(true);
    expect(plan.side.map((z) => z.id)).toContain('cn:hacker');
  });
});
