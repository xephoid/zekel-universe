// Warble Way Galaxy's portraits as holograms (build item 3): every portrait
// the map names is served and every served file is named; a race, the red
// shirt or an attacker finds its file by id or printed name and anything
// else gets none; the hologram is two stacked copies, the ghost under the
// main image, in gold or red, sized by the wrapper.

import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { warbleWayGallery } from '../glue';

// The screen lives in @zekel/warble-way-galaxy; the pictures it names are
// served from here. Every portrait is a race, the red shirt or an attacker.
const { ATTACKERS, RACES, REDSHIRT, faceUrl, Hologram } = warbleWayGallery;
const PORTRAITS: string[] = [...RACES, REDSHIRT, ...Object.values(ATTACKERS).flat()];

afterEach(cleanup);

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/art/warble-way/portraits');

describe('Warble Way Galaxy holograms', () => {
  it('serves every named portrait and names every served file, each a JPEG', () => {
    const served = readdirSync(DIR).sort();
    expect(served).toHaveLength(17);
    expect(PORTRAITS.map((p) => `${p}.jpg`).sort()).toEqual(served);
    for (const f of served) {
      expect(f).toMatch(/^[a-z-]+\.jpg$/);
      const head = readFileSync(path.join(DIR, f)).subarray(0, 2);
      expect([head[0], head[1]], f).toEqual([0xff, 0xd8]);
    }
  });
  it('finds a portrait by the engine id or the printed name, and nothing for a stranger', () => {
    for (const r of RACES) expect(faceUrl(r)).toBe(`/art/warble-way/portraits/${r}.jpg`);
    expect(faceUrl('Human')).toBe('/art/warble-way/portraits/human.jpg');
    expect(faceUrl('Hive Brute')).toBe('/art/warble-way/portraits/hive-brute.jpg');
    expect(faceUrl('red shirt')).toBeUndefined();
    expect(faceUrl('redshirt')).toBe('/art/warble-way/portraits/redshirt.jpg');
    expect(faceUrl('Zara')).toBeUndefined();
    expect(faceUrl('')).toBeUndefined();
    expect(Object.values(ATTACKERS).flat()).toHaveLength(12);
  });
  it('stacks a ghost under the main copy, gold by default and red for an attacker, at the asked size', () => {
    const { container } = render(<Hologram src="/art/warble-way/portraits/grull.jpg" size={84} label="Grull" />);
    const gx = container.querySelector('.ww-gxi')! as HTMLElement;
    expect(gx.getAttribute('role')).toBe('img');
    expect(gx.getAttribute('aria-label')).toBe('Grull');
    expect(gx.style.width).toBe('84px');
    const imgs = gx.querySelectorAll('img');
    expect(imgs).toHaveLength(2);
    expect(imgs[0]!.className).toBe('ww-ga ww-gh');
    expect(imgs[1]!.className).toBe('ww-ga');
    for (const i of imgs) {
      expect(i.getAttribute('src')).toBe('/art/warble-way/portraits/grull.jpg');
      expect(i.getAttribute('alt')).toBe('');
      expect(i.style.width).toBe('84px');
      expect(i.style.borderRadius).toBe('50%');
    }
    const red = render(<Hologram src="/art/warble-way/portraits/spider-bot.jpg" kind="red" round={false} />);
    const rx = red.container.querySelector('.ww-gxi')!;
    expect(rx.getAttribute('aria-hidden')).toBe('true');
    expect(rx.querySelector('img:not(.ww-gh)')!.className).toBe('ww-ga-red');
    expect((rx.querySelector('img') as HTMLElement).style.borderRadius).toBe('');
  });
});
