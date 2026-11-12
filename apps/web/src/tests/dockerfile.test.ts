// The production image (infra/server.Dockerfile, built by Render) copies each
// workspace package's manifest by name before a frozen install, in both of
// its stages. A package added to the workspace and not to that list breaks
// the install, and nothing else notices until a deploy. So: every folder
// under apps/ and packages/ with a package.json is copied in each stage.

import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const dockerfile = readFileSync(path.join(ROOT, 'infra', 'server.Dockerfile'), 'utf8');

const workspace = ['apps', 'packages'].flatMap((group) =>
  readdirSync(path.join(ROOT, group))
    .filter((name) => existsSync(path.join(ROOT, group, name, 'package.json')))
    .map((name) => `${group}/${name}`),
).sort();

/** The Dockerfile, one piece per stage (each starts at a FROM line). */
const stages = dockerfile.split(/^FROM /m).slice(1);

describe('the production image', () => {
  it('has a build stage and a run stage, and the workspace has packages', () => {
    expect(stages).toHaveLength(2);
    expect(workspace.length).toBeGreaterThan(6);
  });

  it.each([0, 1])('stage %i copies every workspace manifest before its install', (i) => {
    const beforeInstall = stages[i]!.split(/^RUN pnpm install/m)[0]!;
    const missing = workspace.filter((dir) => !new RegExp(`^COPY ${dir}/package\\.json ${dir}/$`, 'm').test(beforeInstall));
    expect(missing).toEqual([]);
  });

  it('the run stage carries the build of every package the server can load', () => {
    // Everything under packages/ is copied; the web app ships as static files.
    const missing = workspace.filter((dir) => dir.startsWith('packages/')).filter((dir) => !stages[1]!.includes(`COPY --from=build /app/${dir}/dist ${dir}/dist`));
    expect(missing).toEqual([]);
  });
});
