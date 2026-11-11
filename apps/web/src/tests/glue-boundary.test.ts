// The wall around the games' drawing code. Each game's glue is on its way to
// its own package in zekel-games, so nothing under glue/ may reach into the
// rest of the web app: a glue imports from its own folder, from the
// published packages (@zekel/glue-kit, @zekel/primitives, @zekel/wire-types, @zekel/tokens) or from React.
// "Its own folder" is the game's own: one game never imports another's
// files. The list of games (glue/index.ts) is the web app's and is the one
// file that may be imported from outside; the rest of the app reaches a game
// only through it. Imports are read from each file's syntax tree, so a
// dynamic import() counts like a static one, and an import() of a path worked
// out at run time is refused, since nobody can say where it goes.

import { describe, expect, it } from 'vitest';
import { lstatSync, readdirSync, readFileSync, statSync } from 'node:fs';
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

/** Where a glob pattern stops being a plain path. */
const WILD = /[*?{[(]/;

/** What a file imports, read from its syntax tree: the modules it names
 *  (static imports and re-exports, import x = require(), import() and
 *  require() of a plain string, import('x') in a type), and how many imports
 *  it works out at run time (import() or require() of anything else), which
 *  nobody can follow. Vite's import.meta.glob is read too: its patterns when
 *  they are plain relative strings, and as worked out at run time when not.
 *  What this cannot see is code that hides the call itself: require under
 *  another name, or eval. */
function importsIn(text: string, fileName = 'x.tsx'): { specs: string[]; globs: string[]; computed: number } {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const specs: string[] = [];
  const globs: string[] = [];
  let computed = 0;
  const str = (n: ts.Node | undefined) => (n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null);
  const noteGlob = (n: ts.Node | undefined) => {
    const parts = n && ts.isArrayLiteralExpression(n) ? [...n.elements] : [n];
    for (const part of parts) {
      const pattern = str(part);
      if (pattern === null) computed++;
      else if (pattern.startsWith('!')) continue; // takes files away, adds none
      else if (!pattern.startsWith('.')) computed++; // from the project root or an alias: not followed here
      // Vite joins the whole pattern before it looks, so a ".." after a
      // wildcard climbs out of the folder the pattern seems to start in.
      else if (WILD.test(pattern) && pattern.slice(pattern.search(WILD)).includes('..')) computed++;
      else globs.push(pattern);
    }
  };
  const isGlob = (n: ts.Node) => ts.isPropertyAccessExpression(n) && ts.isMetaProperty(n.expression) && n.name.text.startsWith('glob');
  const note = (n: ts.Node | undefined) => {
    if (n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))) specs.push(n.text);
    else computed++;
  };
  const visit = (n: ts.Node) => {
    if (ts.isImportDeclaration(n)) note(n.moduleSpecifier);
    else if (ts.isExportDeclaration(n)) { if (n.moduleSpecifier) note(n.moduleSpecifier); }
    else if (ts.isImportEqualsDeclaration(n)) { if (ts.isExternalModuleReference(n.moduleReference)) note(n.moduleReference.expression); }
    else if (ts.isImportTypeNode(n)) note(ts.isLiteralTypeNode(n.argument) ? n.argument.literal : undefined);
    else if (ts.isCallExpression(n) && (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === 'require'))) {
      note(n.arguments.length === 1 ? n.arguments[0] : undefined);
    } else if (ts.isCallExpression(n) && isGlob(n.expression)) noteGlob(n.arguments[0]);
    else if (isGlob(n) && !(ts.isCallExpression(n.parent) && n.parent.expression === n)) computed++; // glob passed around, not called
    ts.forEachChild(n, visit);
  };
  const withParents = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  visit(withParents);
  return { specs, globs, computed };
}

/** The folder a glob pattern starts looking from: everything before its
 *  first wildcard, back to the last slash. importsIn has already refused a
 *  pattern that climbs with ".." after that point, so nothing it matches is
 *  outside this folder. */
function globBase(file: string, pattern: string): string {
  const fixed = WILD.test(pattern) ? pattern.slice(0, pattern.search(WILD)) : pattern;
  return path.resolve(path.dirname(file), fixed.slice(0, fixed.lastIndexOf('/') + 1));
}

/** True when a folder is glue/, inside it, or holds it. */
const touchesGlue = (dir: string) => dir === GLUE || dir.startsWith(GLUE + path.sep) || GLUE.startsWith(dir + path.sep);

const importsOf = (file: string) => importsIn(readFileSync(file, 'utf8'), file);

/** Symbolic links under a folder. A link would let a file sit in one game's
 *  folder and be another game's, or the app's. */
function linksUnder(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = lstatSync(p);
    if (st.isSymbolicLink()) out.push(p);
    else if (st.isDirectory()) linksUnder(p, out);
  }
  return out;
}

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

const LIST = [path.join(GLUE, 'index'), path.join(GLUE, 'index.ts')];

/** The game a path under glue/ belongs to, 'list' for glue/index.ts and
 *  nothing else, or null for a path outside glue/ or one no game owns. */
function ownerOf(target: string): string | null {
  if (LIST.includes(target)) return 'list';
  if (target === GLUE || !target.startsWith(GLUE + path.sep)) return null;
  const first = path.relative(GLUE, target).split(path.sep)[0]!.replace(/\.(ts|tsx)$/, '');
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
      "import h = require('./h');",
      "type I = import('./i').I;",
      "const j = import(`./j`);",
    ].join('\n');
    expect(importsIn(text, 'x.ts')).toEqual({ specs: ['./a', './b', './c', './d.css', './e', './f', './g', './h', './i', './j'], globs: [], computed: 0 });
  });

  it('counts an import whose path is worked out at run time', () => {
    expect(importsIn("const m = await import(`../pages/${name}`);").computed).toBe(1);
    expect(importsIn("const m = await import(where);\nconst n = require(base + '/x');").computed).toBe(2);
    expect(importsIn("// import(where) in a comment\n/* require(x) */\nconst s = 'import(where)';")).toEqual({ specs: [], globs: [], computed: 0 });
  });

  it('reads a glob\'s patterns, and refuses one it cannot follow', () => {
    expect(importsIn("const a = import.meta.glob<X>('../tests/fixtures/ao/*.json', { import: 'default' });")).toEqual({ specs: [], globs: ['../tests/fixtures/ao/*.json'], computed: 0 });
    expect(importsIn("const a = import.meta.glob(['./a/*.ts', '!./a/skip.ts', './b/**']);").globs).toEqual(['./a/*.ts', './b/**']);
    expect(importsIn("const a = import.meta.glob(pattern);").computed).toBe(1);
    expect(importsIn("const a = import.meta.glob('/src/glue/**');").computed).toBe(1);
    expect(importsIn("const g = import.meta.glob; g('../glue/**');").computed).toBe(1);
    // A climb after a wildcard: in glue/ff this reaches glue/wd, from pages/ it reaches a game.
    expect(importsIn("const a = import.meta.glob('./*/../../wd/*.ts');")).toEqual({ specs: [], globs: [], computed: 1 });
    expect(importsIn("const a = import.meta.glob('./*/../../glue/ff/*.tsx');").computed).toBe(1);
    expect(importsIn("const a = import.meta.glob('./{a,../../wd}/*.ts');").computed).toBe(1);
    expect(importsIn("const a = import.meta.glob('../../tests/fixtures/*.json');").globs).toEqual(['../../tests/fixtures/*.json']);
    const page = path.join(SRC, 'pages', 'Dev.tsx');
    expect(touchesGlue(globBase(page, '../tests/fixtures/ao/*.json'))).toBe(false);
    expect(touchesGlue(globBase(page, '../glue/ff/*.tsx'))).toBe(true);
    expect(touchesGlue(globBase(page, '../**/*.tsx'))).toBe(true);
    expect(touchesGlue(globBase(page, '../gl*/x.ts'))).toBe(true);
  });

  it('is not fooled by comment marks inside strings', () => {
    expect(importsIn("const a = '/*'; import(where); const b = '*/';").computed).toBe(1);
    expect(importsIn("const a = '//'; const m = import('./m'); // import('./n')").specs).toEqual(['./m']);
  });

  it('calls only glue/index.ts the list', () => {
    expect(ownerOf(path.join(GLUE, 'index.ts'))).toBe('list');
    expect(ownerOf(path.join(GLUE, 'index'))).toBe('list');
    expect(ownerOf(path.join(GLUE, 'index', 'rogue.ts'))).toBeNull();
    expect(ownerOf(path.join(GLUE, 'index.tsx'))).toBeNull();
    expect(ownerOf(path.join(GLUE, 'wd', 'index.ts'))).toBe('word-debauchee');
    expect(ownerOf(path.join(GLUE, 'fractured-fist.ts'))).toBe('fractured-fist');
    expect(ownerOf(path.join(SRC, 'pages', 'Table.tsx'))).toBeNull();
    expect(ownerOf(GLUE)).toBeNull();
  });
});

describe('the games\' drawing code stays behind its wall', () => {
  const files = walk(GLUE);

  it('finds the glue', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('has no symbolic links under glue/', () => {
    expect(linksUnder(GLUE).map((f) => path.relative(SRC, f))).toEqual([]);
  });

  it('knows which game every file under glue/ belongs to', () => {
    expect(files.filter((f) => ownerOf(f) === null).map((f) => path.relative(SRC, f))).toEqual([]);
  });

  it('imports only its own game\'s files, the published packages and React', () => {
    const leaks: string[] = [];
    for (const file of files) {
      const me = ownerOf(file);
      const { specs, globs, computed } = importsOf(file);
      if (computed > 0) leaks.push(`${path.relative(SRC, file)} → an import worked out at run time`);
      // A game's glob stays in the game's own folder; the list has none.
      for (const g of globs) if (me === 'list' || ownerOf(globBase(file, g)) !== me) leaks.push(`${path.relative(SRC, file)} → glob ${g}`);
      for (const spec of specs) {
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
      const { specs, globs, computed } = importsOf(file);
      if (computed > 0) reaches.push(`${path.relative(SRC, file)} → an import worked out at run time`);
      for (const g of globs) if (touchesGlue(globBase(file, g))) reaches.push(`${path.relative(SRC, file)} → glob ${g}`);
      for (const spec of specs) {
        if (!spec.startsWith('.')) continue;
        const target = path.resolve(path.dirname(file), spec);
        if (target.startsWith(GLUE + path.sep) && target !== path.join(GLUE, 'index')) reaches.push(`${path.relative(SRC, file)} → ${spec}`);
      }
    }
    expect(reaches).toEqual([]);
  });
});
