// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskForm } from './TaskForm';

let container: HTMLDivElement;
let root: Root | undefined;

function getByRole<T extends HTMLElement>(role: 'checkbox' | 'textbox', name: string): T {
  const selector = role === 'checkbox' ? 'input[type="checkbox"]' : 'input, textarea';
  const control = [...container.querySelectorAll<HTMLElement>(selector)].find((candidate) => {
    const label = candidate.id ? container.querySelector(`label[for="${candidate.id}"]`) : null;
    return label?.textContent?.trim().replace(/\s+/g, ' ') === name;
  });
  if (!(control instanceof HTMLElement)) throw new Error(`${role} named ${name} was not rendered`);
  return control as T;
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setValue) throw new Error('Input value setter is unavailable');
  setValue.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('TaskForm', () => {
  it('requires final handoff by default and explains that no work is stored or sent', () => {
    const markup = renderToStaticMarkup(<TaskForm onSubmit={async () => undefined} />);

    expect(markup).toContain('Final handoff required');
    expect(markup).toContain('OpenWork only asks for confirmation; it does not store or send the work.');
    expect(markup).toContain('checked=""');
  });

  it('submits the changed Final handoff required choice', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    act(() => {
      root = createRoot(container);
      root.render(<TaskForm onSubmit={onSubmit} />);
    });

    const handoffRequired = getByRole<HTMLInputElement>('checkbox', 'Final handoff required');
    expect(handoffRequired.checked).toBe(true);
    await act(async () => {
      setInputValue(getByRole<HTMLInputElement>('textbox', 'Title *'), 'Prepare update');
      handoffRequired.click();
      container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Prepare update',
      handoffRequired: false,
    }));
  });

  it('does not offer tenant admins as task assignees', () => {
    const markup = renderToStaticMarkup(
      <TaskForm
        onSubmit={async () => undefined}
        assignees={[
          {
            userId: 'admin-1',
            displayName: 'Ada Admin',
            email: 'ada@example.org',
            role: 'admin',
          },
          {
            userId: 'head-1',
            displayName: 'Harper Head',
            email: 'harper@example.org',
            role: 'department_head',
          },
          {
            userId: 'employee-1',
            displayName: 'Eli Employee',
            email: 'eli@example.org',
            role: 'employee',
          },
        ]}
      />,
    );

    expect(markup).not.toContain('Ada Admin');
    expect(markup).not.toContain('admin-1');
    expect(markup).toContain('Harper Head');
    expect(markup).toContain('Eli Employee');
  });
});
