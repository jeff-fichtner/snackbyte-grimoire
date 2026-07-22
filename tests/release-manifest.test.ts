/**
 * Guards the release manifest the tagging flow reads.
 *
 * `environments.json` decides two things on every push: whether the branch is a release
 * channel at all, and what suffix its tag carries. Both failure modes here are silent —
 * a duplicated branch makes the resolved channel depend on array order, and a duplicated
 * suffix makes two channels compete for the same tag. Neither shows up as an error at
 * release time; they show up as a tag pointing at the wrong commit.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface Environment {
  name: string;
  branch: string;
  tagSuffix: string;
}

const repoRoot = new URL('..', import.meta.url);
const readJson = (relativePath: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(relativePath, repoRoot)), 'utf8'));

const manifest = readJson('environments.json') as { environments: Environment[] };
const pkg = readJson('package.json') as { version: string };

describe('environments.json', () => {
  it('declares at least one release channel', () => {
    expect(Array.isArray(manifest.environments)).toBe(true);
    expect(manifest.environments.length).toBeGreaterThan(0);
  });

  it('gives every channel the fields the flow reads', () => {
    for (const environment of manifest.environments) {
      expect(typeof environment.name, `name on ${JSON.stringify(environment)}`).toBe('string');
      expect(typeof environment.branch, `branch on ${environment.name}`).toBe('string');
      expect(typeof environment.tagSuffix, `tagSuffix on ${environment.name}`).toBe('string');
      expect(environment.name.length).toBeGreaterThan(0);
      expect(environment.branch.length).toBeGreaterThan(0);
    }
  });

  it('maps each branch to exactly one channel', () => {
    const branches = manifest.environments.map((environment) => environment.branch);
    expect(new Set(branches).size, `duplicate branch in ${branches.join(', ')}`).toBe(
      branches.length,
    );
  });

  it('gives each channel a distinct tag suffix', () => {
    const suffixes = manifest.environments.map((environment) => environment.tagSuffix);
    expect(new Set(suffixes).size, `duplicate tagSuffix in ${suffixes.join(', ')}`).toBe(
      suffixes.length,
    );
  });
});

describe('package.json', () => {
  it('carries a version the release flow can read a MAJOR.MINOR line from', () => {
    // The flow derives PATCH itself as a build counter; it only reads MAJOR.MINOR here.
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
