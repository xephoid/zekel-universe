// The wall around the games' drawing code. Each game's glue is on its way to
// its own package in zekel-games, so nothing under glue/ may reach into the
// rest of the web app: a glue imports from its own folder, from the
// workspace packages (@universe/glue-kit, @universe/table-parts,
// @universe/primitives, @universe/shared, @universe/tokens) or from React.
// The list of games (glue/index.ts) is the web app's and is the one file
// that may be imported from outside; the rest of the app reaches a game only
// through it.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GLUE = path.join(SRC, 'glue');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const IMPORT = /(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g;

function importsOf(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const specs: string[] = [];
  for (const m of text.matchAll(IMPORT)) specs.push((m[1] ?? m[2])!);
  return specs;
}

const ALLOWED_PACKAGES = ['react', 'react-dom', '@universe/glue-kit', '@universe/table-parts', '@universe/primitives', '@universe/shared', '@universe/tokens'];

describe('the games\' drawing code stays behind its wall', () => {
  const files = walk(GLUE);

  it('finds the glue', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('imports nothing from the web app outside glue/', () => {
    const leaks: string[] = [];
    for (const file of files) {
      for (const spec of importsOf(file)) {
        if (spec.startsWith('.')) {
          const target = path.resolve(path.dirname(file), spec);
          if (!target.startsWith(GLUE + path.sep)) leaks.push(`${path.relative(SRC, file)} → ${spec}`);
        } else if (!ALLOWED_PACKAGES.some((p) => spec === p || spec.startsWith(p + '/'))) {
          leaks.push(`${path.relative(SRC, file)} → ${spec}`);
        }
      }
    }
    expect(leaks).toEqual([]);
  });

  it('is reached from the rest of the app only through glue/index.ts', () => {
    const outside = walk(SRC).filter((f) => !f.startsWith(GLUE + path.sep) && !f.startsWith(path.join(SRC, 'tests') + path.sep));
    const reaches: string[] = [];
    for (const file of outside) {
      for (const spec of importsOf(file)) {
        if (!spec.startsWith('.')) continue;
        const target = path.resolve(path.dirname(file), spec);
        if (target.startsWith(GLUE + path.sep) && target !== path.join(GLUE, 'index')) reaches.push(`${path.relative(SRC, file)} → ${spec}`);
      }
    }
    expect(reaches).toEqual([]);
  });
});
