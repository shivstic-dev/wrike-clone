import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const globalStyles = readFileSync(new URL('./index.css', import.meta.url), 'utf8');

describe('Operations Atlas global styles', () => {
  it('assigns the display font to every heading level', () => {
    expect(globalStyles).toMatch(
      /h1,\s*h2,\s*h3,\s*h4,\s*h5,\s*h6\s*\{\s*font-family: var\(--atlas-font-display\);\s*\}/,
    );
  });
});
