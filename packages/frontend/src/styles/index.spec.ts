import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const globalStyles = readFileSync(new URL('./index.css', import.meta.url), 'utf8');

describe('Operations Atlas global styles', () => {
  it('assigns the display font to every heading level', () => {
    expect(globalStyles).toMatch(
      /h1,\s*h2,\s*h3,\s*h4,\s*h5,\s*h6\s*\{\s*font-family: var\(--atlas-font-display\);\s*\}/,
    );
  });

  it('defines the shared Sunny Studio palette and type system in one root contract', () => {
    expect(globalStyles).toContain('--atlas-canopy: #6656a8');
    expect(globalStyles).toContain('--atlas-sprout: #a9dcc8');
    expect(globalStyles).toContain('--atlas-blush: #ffe5ea');
    expect(globalStyles).toContain("--atlas-font-display: 'Fredoka'");
    expect(globalStyles).toContain("--atlas-font-body: 'Nunito Sans'");
  });

  it('keeps decorative movement optional for reduced-motion users', () => {
    expect(globalStyles).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.sunny-bob[\s\S]*animation: none/,
    );
  });
});
