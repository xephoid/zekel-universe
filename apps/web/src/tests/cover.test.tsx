// The game cover: real art when the catalog has it, cropped to each frame
// from the game's focus point (the center when it has none), and the flat
// placeholder with the initial when it has no art.

import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { GameCatalogEntry } from '@universe/shared';
import { Cover } from '../ui';

afterEach(cleanup);

const game = (over: Partial<GameCatalogEntry>): GameCatalogEntry => ({
  engineGameId: 'warble-way-galaxy', name: 'Warble Way Galaxy', designerName: 'Zekel Games',
  playerCount: '1', minPlayers: 1, maxPlayers: 1, supportsAi: true, playTime: '', tags: [],
  coverImage: null, coverFocus: null, description: '', rulesUrl: null, visibility: 'public', designerSlug: null, screenshots: [], featuredRank: null,
  ...over,
});

describe('Cover', () => {
  it("crops the art from the game's focus point", () => {
    const { container } = render(<Cover game={game({ coverImage: '/art/covers/warble-way-galaxy.webp', coverFocus: '50% 18%' })} />);
    const img = container.querySelector('img.gpcover.large') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/art/covers/warble-way-galaxy.webp');
    expect(img.style.objectPosition).toBe('50% 18%');
  });

  it('leaves the crop to the stylesheet (the center) without a focus point', () => {
    const { container } = render(<Cover game={game({ coverImage: '/art/covers/warble-way-galaxy.webp' })} size="small" />);
    expect((container.querySelector('img.gpcover.small') as HTMLImageElement).style.objectPosition).toBe('');
  });

  it('draws the placeholder initial when there is no art', () => {
    const { container } = render(<Cover game={game({})} size="tile" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.gpcover.tile .initial')!.textContent).toBe('W');
  });
});
