// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { Button, PageHeader, Skeleton, StatePanel, type StatePanelProps } from './index';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const statePanelProps: StatePanelProps = {
  title: 'No assigned work',
  description: 'New assignments appear here.',
};

const statePanelPropsWithLayout: StatePanelProps = {
  ...statePanelProps,
  // @ts-expect-error StatePanel deliberately does not accept legacy layout props.
  className: 'legacy-layout',
};

describe('Workboard UI primitives', () => {
  it('keeps native button semantics and exposes visible labels', () => {
    const html = renderToStaticMarkup(<Button variant="primary">Create task</Button>);

    expect(html).toContain('<button');
    expect(html).toContain('Create task');
    expect(html).toContain('focus-visible:');
  });

  it('forwards native button attributes and refs', () => {
    const container = document.createElement('div');
    const ref = createRef<HTMLButtonElement>();
    const root = createRoot(container);

    act(() => {
      root.render(
        <Button ref={ref} aria-label="Create a task" disabled name="create-task" value="new">
          Create task
        </Button>,
      );
    });

    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(ref.current?.disabled).toBe(true);
    expect(ref.current?.getAttribute('aria-label')).toBe('Create a task');
    expect(ref.current?.name).toBe('create-task');
    expect(ref.current?.value).toBe('new');

    act(() => root.unmount());
  });

  it('uses high-contrast button text and visible focus outlines', () => {
    const primary = renderToStaticMarkup(<Button variant="primary">Create task</Button>);
    const danger = renderToStaticMarkup(<Button variant="danger">Delete task</Button>);

    expect(primary).toContain('focus-visible:outline-primary-700');
    expect(primary).toContain('focus-visible:outline-offset-2');
    expect(danger).toContain('text-white');
    expect(danger).toContain('focus-visible:outline-red-700');
    expect(danger).toContain('focus-visible:outline-offset-2');
  });

  it('keeps the danger hover state explicit', () => {
    const danger = renderToStaticMarkup(<Button variant="danger">Delete task</Button>);

    expect(danger).toContain('bg-red-600');
    expect(danger).toContain('text-white');
    expect(danger).toContain('hover:bg-red-700');
  });

  it('suppresses skeleton animation when reduced motion is requested', () => {
    const html = renderToStaticMarkup(<Skeleton />);

    expect(html).toContain('animate-pulse');
    expect(html).toContain('motion-reduce:animate-none');
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
