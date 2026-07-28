// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button, PageHeader, StatePanel } from './index';

describe('Operations Atlas UI primitives', () => {
  it('keeps native button semantics and exposes visible labels', () => {
    const html = renderToStaticMarkup(<Button variant="primary">Create task</Button>);

    expect(html).toContain('<button');
    expect(html).toContain('Create task');
    expect(html).toContain('focus-visible:');
  });

  it('renders one page heading and a directed empty action', () => {
    const html = renderToStaticMarkup(
      <>
        <PageHeader eyebrow="CEPAA" title="My work" description="Assigned work" />
        <StatePanel
          title="No assigned work"
          description="New assignments appear here."
          action={<a href="/dashboard">Return to dashboard</a>}
        />
      </>,
    );

    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('Return to dashboard');
  });
});
