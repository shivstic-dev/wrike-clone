import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const globalStyles = readFileSync(new URL('./index.css', import.meta.url), 'utf8');

describe('Workboard global styles', () => {
  it('assigns the display font to every heading level', () => {
    expect(globalStyles).toMatch(
      /h1,\s*h2,\s*h3,\s*h4,\s*h5,\s*h6\s*\{\s*font-family: var\(--atlas-font-display\);\s*\}/,
    );
  });

  it('defines the shared Workboard palette and type system in one root contract', () => {
    expect(globalStyles).toContain('--atlas-canopy: #0d3b2a');
    expect(globalStyles).toContain('--atlas-sprout: #73bf96');
    expect(globalStyles).toContain('--atlas-blush: #f7e5e5');
    expect(globalStyles).toContain("--atlas-font-display: 'Manrope'");
    expect(globalStyles).toContain("--atlas-font-body: 'Inter'");
  });

  it('keeps the shared theme free of ambient animation', () => {
    expect(globalStyles).not.toContain('@keyframes sunny');
    expect(globalStyles).not.toContain('animation: sunny');
  });

  it('provides one reusable professional card and featured metric treatment', () => {
    expect(globalStyles).toContain('.workboard-card');
    expect(globalStyles).toContain('.workboard-feature');
  });
});
