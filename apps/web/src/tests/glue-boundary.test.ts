// The wall around the games' drawing code. Each game's glue is on its way to
// its own package in zekel-games, so nothing under glue/ may reach into the
// rest of the web app: a glue imports from its own folder, from the
// published packages (@zekel/glue-kit, @zekel/primitives, @zekel/wire-types, @zekel/tokens) or from React.
// "Its own folder" is the game's own: one game never imports another's
// files. The list of games (glue/index.ts) is the web app's and is the one
// file that may be imported from outside; the rest of the app reaches a game
// only through it. Imports are read with the compiler's own scanner, so a
// dynamic import() counts like a static one, and an import() of a path worked
// out at run time is refused, since nobody can say where it goes.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

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

/** Every module a file names: static imports and re-exports, side-effect
 *  imports, import() and require() of a literal. */
function specsIn(text: string): string[] {
  return ts.preProcessFile(text, true, true).importedFiles.map((f) => f.fileName);
}

/** import() or require() of something other than a plain string. */
function computedImportsIn(text: string): number {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  return [...code.matchAll(/\b(?:import|require)\s*\(\s*(?!['"][^'"]*['"]\s*\))/g)].length;
}

const read = (file: string) => readFileSync(file, 'utf8');

const ALLOWED_PACKAGES = ['react', 'react-dom', '@zekel/glue-kit', '@zekel/primitives', '@zekel/wire-types', '@zekel/tokens'];

/** Each game's files under glue/: its folder, and its top-level files. */
const GAMES: Record<string, string[]> = {
  'fractured-fist': ['ff', 'fractured-fist'],
  'sweetlands-imperium': ['sl', 'sweetlands-imperium', 'sweetlands-board'],
  'cybernoir-2127': ['cn', 'cybernoir-2127'],
  'warble-way-galaxy': ['ww', 'warble-way-galaxy'],
  'neither-guts-nor-gears': ['ngg'],
  'adventurer-olympics': ['ao'],
  'word-debauchee': ['wd'],
};

/** The game a path under glue/ belongs to, 'list' for glue/index.ts, or null
 *  for a path outside glue/ or one no game owns. */
function ownerOf(target: string): string | null {
  if (target === GLUE || !target.startsWith(GLUE + path.sep)) return null;
  const first = path.relative(GLUE, target).split(path.sep)[0]!.replace(/\.(ts|tsx)$/, '');
  if (first === 'index') return 'list';
  for (const [game, parts] of Object.entries(GAMES)) if (parts.includes(first)) return game;
  return null;
}

describe('the scanner the wall is checked with', () => {
  it('sees every way a file can name another', () => {
    const text = [
      "import a from './a'; import { b } from './b';",
      "export { c } from './c';",
      "import './d.css';",
      "const e = await import('./e');",
      "  const f = () => import(\"./f\");",
      "const g = require('./g');",
    ].join('\n');
    expect(specsIn(text)).toEqual(['./a', './b', './c', './d.css', './e', './f', './g']);
    expect(computedImportsIn(text)).toBe(0);
  });

  it('counts an import whose path is worked out at run time', () => {
    expect(computedImportsIn("const m = await import(`../pages/${name}`);")).toBe(1);
    expect(computedImportsIn("const m = await import(where);\nconst n = require(base + '/x');")).toBe(2);
    expect(computedImportsIn("// import(where) in a comment\n/* require(x) */")).toBe(0);
  });
});

describe('the games\' drawing code stays behind its wall', () => {
  const files = walk(GLUE);

  it('finds the glue', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('knows which game every file under glue/ belongs to', () => {
    expect(files.filter((f) => ownerOf(f) === null).map((f) => path.relative(SRC, f))).toEqual([]);
  });

  it('imports only its own game\'s files, the published packages and React', () => {
    const leaks: string[] = [];
    for (const file of files) {
      const me = ownerOf(file);
      const text = read(file);
      if (computedImportsIn(text) > 0) leaks.push(`${path.relative(SRC, file)} → an import worked out at run time`);
      for (const spec of specsIn(text)) {
        if (spec.startsWith('.')) {
          const owner = ownerOf(path.resolve(path.dirname(file), spec));
          // The list names every game; a game names only itself.
          const ok = me === 'list' ? owner !== null && owner !== 'list' : owner === me;
          if (!ok) leaks.push(`${path.relative(SRC, file)} → ${spec}`);
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
      const text = read(file);
      if (computedImportsIn(text) > 0) reaches.push(`${path.relative(SRC, file)} → an import worked out at run time`);
      for (const spec of specsIn(text)) {
        if (!spec.startsWith('.')) continue;
        const target = path.resolve(path.dirname(file), spec);
        if (target.startsWith(GLUE + path.sep) && target !== path.join(GLUE, 'index')) reaches.push(`${path.relative(SRC, file)} → ${spec}`);
      }
    }
    expect(reaches).toEqual([]);
  });
});
