// @vitest-environment node
/**
 * publish-to-site — converts a design canvas (.dc.html) to a complete standalone page for
 * the site's work/ section. The properties that matter: the canvas-editor runtime never
 * reaches the published page, the helmet becomes the head, and a file that isn't a canvas
 * is refused rather than half-converted.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain JS publish script, no types
import { convertCanvas } from '../../scripts/publish-to-site.mjs';

const canvas = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<meta name="design_doc_mode" content="canvas">
<link href="https://fonts.example/css" rel="stylesheet">
<style>body { background: #000; }</style>
</helmet>
<div>the artboards</div>
</x-dc>
</body>
</html>`;

describe('convertCanvas', () => {
  it('emits a complete, non-indexable document carrying the helmet and the content', () => {
    const page = convertCanvas(canvas, 'A Page');
    expect(page.startsWith('<!doctype html>')).toBe(true);
    expect(page).toContain('<title>A Page</title>');
    expect(page).toContain('noindex');
    expect(page).toContain('<link href="https://fonts.example/css" rel="stylesheet">');
    expect(page).toContain('<div>the artboards</div>');
  });

  it('leaves the canvas-editor runtime behind', () => {
    const page = convertCanvas(canvas, 'A Page');
    expect(page).not.toContain('support.js');
    expect(page).not.toContain('<x-dc');
    expect(page).not.toContain('design_doc_mode');
  });

  it('refuses a file that is not a canvas', () => {
    expect(() => convertCanvas('<!doctype html><body>plain</body>', 'A Page')).toThrow(
      /not a canvas file/,
    );
  });
});
