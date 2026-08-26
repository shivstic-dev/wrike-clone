import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceMemberRoleControl } from './AdminPage';

describe('WorkspaceMemberRoleControl', () => {
  it('renders tenant admins as a non-editable badge', () => {
    const onRoleChange = vi.fn();
    const markup = renderToStaticMarkup(
      <WorkspaceMemberRoleControl role="admin" disabled={false} onRoleChange={onRoleChange} />,
    );

    expect(markup).toContain('Admin');
    expect(markup).not.toContain('<select');
    expect(markup).not.toContain('value="admin"');
    expect(onRoleChange).not.toHaveBeenCalled();
  });

  it('keeps department roles editable', () => {
    const markup = renderToStaticMarkup(
      <WorkspaceMemberRoleControl
        role="department_head"
        disabled={false}
        onRoleChange={() => undefined}
      />,
    );

    expect(markup).toContain('<select');
    expect(markup).toContain('Department Head');
  });
});
