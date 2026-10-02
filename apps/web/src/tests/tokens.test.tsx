// The token shapes of the track and pool primitives (spaceShape and itemShape
// 'token'): Cybernoir's clue fare tokens. An empty slot is a dashed "?", a
// filled one shows its value; a ruled-out token carries its sash, caption and
// colour, and a reader hears all of it.

import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Pool, Track } from '@universe/primitives';

afterEach(cleanup);

describe('clue tokens', () => {
  it('draws a slot per category, "?" until it is filled', () => {
    const { container } = render(<Track id="t" data={{
      label: 'What the Detective knows', spaceShape: 'token',
      spaces: [
        { index: 'Borough', label: 'Downtown', filled: true },
        { index: 'Population', filled: false },
      ],
    }} />);
    const slots = [...container.querySelectorAll('.zk-track-token')];
    expect(slots.map((s) => s.className)).toEqual(['zk-track-token filled', 'zk-track-token']);
    expect(slots[0]!.getAttribute('aria-label')).toBe('Borough: Downtown');
    expect(slots[1]!.getAttribute('aria-label')).toBe('Population: not known yet');
    expect(slots[1]!.querySelector('.zk-token-value.unknown')!.textContent).toBe('?');
    expect(container.querySelector('.zk-track.tokens')).not.toBeNull();
  });

  it('draws a ruled-out token with its sash, caption and colour', () => {
    const { container } = render(<Pool id="p" data={{
      label: 'Ruled out (1)', itemShape: 'token',
      items: [{ label: 'Chimera', caption: 'Affiliation', sash: 'NOT', count: 1, colorKey: 'gang_3' }],
    }} />);
    const token = container.querySelector('.zk-pool-token') as HTMLElement;
    expect(token.getAttribute('aria-label')).toBe('NOT Affiliation Chimera');
    expect(token.style.getPropertyValue('--token')).toContain('--zekel-c-gang-3');
    expect(token.querySelector('.zk-token-sash')!.textContent).toBe('NOT');
    expect(screen.getByText('Chimera').className).toBe('zk-token-value');
    // The chip shape's swatch and name are not drawn as well.
    expect(container.querySelector('.zk-pool-item')).toBeNull();
  });
});
