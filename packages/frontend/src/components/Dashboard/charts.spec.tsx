import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import * as DistributionChartModule from './DistributionChart';
import * as WorkMovementChartModule from './WorkMovementChart';
import { DistributionChart } from './DistributionChart';
import { WorkMovementChart } from './WorkMovementChart';

describe('accessible dashboard charts', () => {
  it('exports chart modules for direct React.lazy loading', () => {
    expect(WorkMovementChartModule.default).toBe(WorkMovementChart);
    expect(DistributionChartModule.default).toBe(DistributionChart);
  });

  it('renders a movement summary and exact fallback values', () => {
    const html = renderToStaticMarkup(
      <WorkMovementChart
        generatedAt="2026-07-28T12:00:00Z"
        daily={[{ date: '2026-07-28', created: 3, completed: 2 }]}
      />,
    );

    expect(html).toContain('Created 3');
    expect(html).toContain('Completed 2');
    expect(html).toContain('<details');
    expect(html).toContain('<summary');
    expect(html).toContain('<table');
    expect(html).toContain('2026-07-28T12:00:00Z');
  });

  it('labels the chart region with a semantic title and description', () => {
    const html = renderToStaticMarkup(
      <WorkMovementChart
        generatedAt="2026-07-28T12:00:00Z"
        daily={[{ date: 'not-a-date', created: 1, completed: 0 }]}
      />,
    );

    expect(html).toContain('30-day work movement');
    expect(html).toContain('Daily tasks created and completed during the reporting window.');
    expect(html).toContain('not-a-date');
    expect(html).toMatch(/aria-labelledby="[^"]+"/);
    expect(html).toMatch(/aria-describedby="[^"]+"/);
  });

  it('uses responsive Atlas series classes with animation disabled', () => {
    const html = renderToStaticMarkup(
      <WorkMovementChart
        generatedAt="2026-07-28T12:00:00Z"
        daily={[{ date: '2026-07-28', created: 3, completed: 2 }]}
      />,
    );

    expect(html).toContain('recharts-responsive-container');
    expect(html).toContain('dashboard-series-created');
    expect(html).toContain('dashboard-series-completed');
    expect(html).toContain('data-chart-animation="disabled"');
    expect(html).not.toContain('<linearGradient');
  });

  it('shows an honest empty movement state without fake points', () => {
    const html = renderToStaticMarkup(
      <WorkMovementChart generatedAt="2026-07-28T12:00:00Z" daily={[]} />,
    );

    expect(html).toContain('No work movement was recorded for this 30-day period.');
    expect(html).toContain('No daily values are available.');
    expect(html).not.toContain('dashboard-series-created');
  });

  it('renders distribution labels, exact values, and a visible disclosure fallback', () => {
    const html = renderToStaticMarkup(
      <DistributionChart
        title="Status distribution"
        description="Current tasks grouped by status."
        generatedAt="2026-07-28T12:00:00Z"
        values={{ in_progress: 4, blocked: 1 }}
      />,
    );

    expect(html).toContain('In progress 4');
    expect(html).toContain('Blocked 1');
    expect(html).toContain('View exact data');
    expect(html).toContain('<table');
    expect(html).toContain('dashboard-series-distribution');
    expect(html).toContain('data-chart-animation="disabled"');
    expect(html).not.toContain('<linearGradient');
  });

  it('shows an honest empty distribution state', () => {
    const html = renderToStaticMarkup(
      <DistributionChart
        title="Priority distribution"
        description="Current tasks grouped by priority."
        generatedAt="invalid"
        values={{}}
      />,
    );

    expect(html).toContain('No distribution data is available for this scope.');
    expect(html).toContain('Generated time unavailable');
    expect(html).toContain('No exact values are available.');
    expect(html).not.toContain('dashboard-series-distribution');
  });
});
