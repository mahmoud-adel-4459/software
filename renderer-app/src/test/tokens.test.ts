import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');
const rel = (f: string) => relative(SRC, f).replace(/\\/g, '/');
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('design tokens only', () => {
  it('has no hex colors in src outside theme/tokens.ts', () => {
    const offenders = walk(SRC)
      .filter((f) => /\.(tsx?|css)$/.test(f))
      .filter((f) => rel(f) !== 'theme/tokens.ts' && !rel(f).startsWith('test/') && !rel(f).startsWith('dev/'))
      .flatMap((f) => (readFileSync(f, 'utf8').match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map((m) => `${rel(f)}: ${m}`));
    expect(offenders).toEqual([]);
  });
});
