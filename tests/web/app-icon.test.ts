// @vitest-environment node
/**
 * Guards the app icon's wiring, in the plain Node environment because it reads the repo
 * off disk (jsdom rewrites `import.meta.url` to a non-file URL).
 *
 * Both failure modes here are silent. A favicon `href` that points at nothing does not
 * error — the browser quietly falls back to a blank page icon, which looks like "no icon
 * was ever designed" rather than "the link is wrong". And the SVG is a hand transcription
 * of `design/GrimoireIcon.dc.html`, where the design states the ring as a CSS border
 * (inside the box) and SVG states it as a stroke (straddling the path); getting that
 * conversion wrong yields an icon that is subtly the wrong size and nothing complains.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = new URL('../../', import.meta.url);
const read = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(relativePath, repoRoot)), 'utf8');

const documentHtml = read('src/web/index.html');

describe('the app icon', () => {
  it('is linked from the document as an SVG favicon', () => {
    expect(documentHtml).toContain('<link rel="icon" type="image/svg+xml" href="/icon.svg" />');
  });

  it('resolves to a file vite will serve at that href', () => {
    // publicDir is <root>/public, and vite serves it at the site root — so the href
    // `/icon.svg` is `src/web/public/icon.svg` in dev and `dist/icon.svg` after a build.
    const icon = read('src/web/public/icon.svg');
    expect(icon.startsWith('<svg')).toBe(true);
    expect(icon).toContain('viewBox="0 0 512 512"');
  });

  it('keeps the radii the design implies, not the boxes the design writes', () => {
    // design: ring 312 box / 6px border -> r 153; faint circle 388 / 2px -> r 193;
    // stone 150 box; inner outline 70 box / 5px border -> 65 box at rx 9.5.
    const icon = read('src/web/public/icon.svg');
    expect(icon).toContain('r="193"');
    expect(icon).toContain('r="153"');
    expect(icon).toContain('width="150" height="150" rx="22"');
    expect(icon).toContain('width="65" height="65" rx="9.5"');
  });

  it('uses the gold that means "the tenant\'s own"', () => {
    // Not decoration: gold is the palette's ownership colour. An icon in any other accent
    // would say something the product does not mean.
    const icon = read('src/web/public/icon.svg');
    expect(icon).toContain('#cda349');
  });
});
