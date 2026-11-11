// The four published packages are ES modules that plain Node must be able to
// import, not only a bundler. Node resolves a relative import only when it
// names the file, extension included, and TypeScript writes the specifier out
// as it was written. So every relative import in what ships ends in .js and
// names a file that is there. This reads the source, not the build; the
// release steps still import the packed package from an empty folder.

import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const PACKAGES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PUBLISHED = ['wire-types', 'tokens', 'primitives', 'glue-kit'];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

describe('what the published packages ship', () => {
  it('names the file in every relative import, so Node can load it', () => {
    const bare: string[] = [];
    let seen = 0;
    for (const pkg of PUBLISHED) {
      for (const file of walk(path.join(PACKAGES, pkg, 'src'))) {
        for (const { fileName } of ts.preProcessFile(readFileSync(file, 'utf8'), true, true).importedFiles) {
          if (!fileName.startsWith('.')) continue;
          seen++;
          const at = path.resolve(path.dirname(file), fileName);
          const there = fileName.endsWith('.json') ? existsSync(at) : ['.ts', '.tsx'].some((ext) => existsSync(at.replace(/\.js$/, ext)));
          if (!/\.(js|json)$/.test(fileName) || !there) bare.push(`${path.relative(PACKAGES, file)} → ${fileName}`);
        }
      }
    }
    expect(seen).toBeGreaterThan(10);
    expect(bare).toEqual([]);
  });
});
