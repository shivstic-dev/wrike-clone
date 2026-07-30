import { describe, expect, it } from 'vitest';
import { createTimelineScale } from './timeline-scale';

describe('createTimelineScale', () => {
  it.each([
    ['day', 40],
    ['week', 14],
    ['month', 4],
  ] as const)('maps UTC dates exactly at %s zoom', (zoom, width) => {
    const scale = createTimelineScale({ from: '2026-03-07', to: '2026-03-10', zoom });
    expect(scale.columnWidth).toBe(width);
    expect(scale.totalWidth).toBe(4 * width);
    expect(scale.dateToX('2026-03-07')).toBe(0);
    expect(scale.dateToX('2026-03-10')).toBe(3 * width);
    expect(scale.xToDate(2 * width)).toBe('2026-03-09');
    expect(scale.snapDelta(width * 1.6)).toBe(2 * width);
  });

  it('keeps same-day bars inclusive and supports today and offscreen positions', () => {
    const scale = createTimelineScale({ from: '2026-03-10', to: '2026-03-10', zoom: 'day' });
    expect(scale.totalWidth).toBe(40);
    expect(scale.dateToX('2026-03-10')).toBe(0);
    expect(scale.dateToX('2026-03-09')).toBe(-40);
    expect(scale.xToDate(-40)).toBe('2026-03-09');
  });
});
