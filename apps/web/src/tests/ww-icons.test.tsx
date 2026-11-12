// Warble Way Galaxy's icons (build item 2): one component draws every shape
// as a mask in the current colour, a ghost under it; every file the map
// names is served, every served file is named, and every fixed meaning maps
// to a shape. The SVGs are served from the site's own origin, so like the
// Fractured Fist card art none may carry anything that runs or reaches out
// (security-check-playbook.md, SEC-11 and SEC-21).

import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { warbleWayGallery } from '../glue';

// The screen lives in @zekel/warble-way-galaxy; the pictures it names are
// served from here.
const { ICON_FILES, Icon, MEANINGS, MeaningIcon } = warbleWayGallery;

afterEach(cleanup);

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/art/warble-way/icons');
const ACTIVE = [/<script/i, /\son[a-z]+\s*=/i, /<foreignObject/i, /javascript:/i, /(?:href|src)\s*=\s*["'](?!#)/i, /url\(\s*["']?(?!#)/i, /@import/i, /<!ENTITY/i];

describe('Warble Way Galaxy icons', () => {
  it('names every served file and serves every named file', () => {
    const served = readdirSync(DIR).sort();
    expect(served).toHaveLength(59);
    expect(Object.values(ICON_FILES).slice().sort()).toEqual(served);
    for (const f of served) expect(f).toMatch(/^[a-z-]+\.(png|svg)$/);
  });
  it('gives every fixed meaning a shape', () => {
    for (const [meaning, name] of Object.entries(MEANINGS)) expect(ICON_FILES[name], meaning).toBeDefined();
    expect(MEANINGS.habitat).toBe('ringed');
    expect(MEANINGS.pirate).toBe(MEANINGS.attacker);
    expect(ICON_FILES.skull).toBe('skull-crossed-bones.png');
    // The full address the screen asks this site for.
    const { container } = render(<Icon name="skull" />);
    const st = (container.querySelector('.ww-ic') as HTMLElement).style;
    expect(st.maskImage || st.webkitMaskImage).toMatch(/^url\("?\/art\/warble-way\/icons\/skull-crossed-bones\.png"?\)$/);
  });
  it('draws the ghost under the icon, both masked with the shape, at the asked size', () => {
    const { container } = render(<Icon name="silo" size={52} label="Ruin" />);
    const gx = container.querySelector('.ww-gx')!;
    expect(gx.getAttribute('role')).toBe('img');
    expect(gx.getAttribute('aria-label')).toBe('Ruin');
    const copies = gx.querySelectorAll('.ww-ic');
    expect(copies).toHaveLength(2);
    expect(copies[0]!.classList.contains('ww-gh')).toBe(true);
    expect(copies[1]!.classList.contains('ww-gh')).toBe(false);
    for (const c of copies) {
      const s = (c as HTMLElement).style;
      expect(s.width).toBe('52px');
      expect(s.height).toBe('52px');
      expect(s.maskImage || s.webkitMaskImage).toMatch(/^url\("?\/art\/warble-way\/icons\/round-silo\.png"?\)$/);
    }
  });
  it('is decoration without a label, and a meaning draws its fixed shape', () => {
    const { container } = render(<MeaningIcon meaning="hazard" />);
    const gx = container.querySelector('.ww-gx')!;
    expect(gx.getAttribute('aria-hidden')).toBe('true');
    expect(gx.getAttribute('data-icon')).toBe('meteorimpact');
  });
  it('serves SVGs that carry nothing that could run or reach out, and no embedded metadata', () => {
    for (const f of readdirSync(DIR).filter((f) => f.endsWith('.svg'))) {
      const svg = readFileSync(path.join(DIR, f), 'utf8');
      expect(svg.startsWith('<svg') || svg.startsWith('<?xml'), f).toBe(true);
      expect(svg.includes('<metadata'), `${f} carries metadata`).toBe(false);
      for (const re of ACTIVE) expect(re.test(svg), `${f} matches ${re}`).toBe(false);
    }
  });
});
