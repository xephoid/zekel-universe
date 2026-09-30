// The card scenes are served from the site's own origin. Drawn in an <img>
// an SVG cannot run anything, but opened on its own it is a document, so no
// scene may carry script, event handlers, embedded HTML or outside links
// (security-check-playbook.md, SEC-11 and SEC-21).

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/cards/fractured-fist');
const ACTIVE = [
  /<script/i,
  /\son[a-z]+\s*=/i,
  /<foreignObject/i,
  /javascript:/i,
  /(?:href|src)\s*=\s*["'](?!#)/i,
  /url\(\s*["']?(?!#)/i,
  /@import/i,
  /<!ENTITY/i,
];

describe('Fractured Fist card art', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.svg'));
  it('has one scene per card, named by the engine id', () => {
    expect(files).toHaveLength(34);
    for (const f of files) expect(f).toMatch(/^[a-z_]+\.svg$/);
  });
  it('carries nothing that could run or reach out', () => {
    for (const f of files) {
      const svg = readFileSync(path.join(DIR, f), 'utf8');
      expect(svg.startsWith('<svg') || svg.startsWith('<?xml'), f).toBe(true);
      for (const re of ACTIVE) expect(re.test(svg), `${f} matches ${re}`).toBe(false);
    }
  });
});
