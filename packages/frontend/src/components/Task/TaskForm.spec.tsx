import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TaskForm } from './TaskForm';

describe('TaskForm', () => {
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
