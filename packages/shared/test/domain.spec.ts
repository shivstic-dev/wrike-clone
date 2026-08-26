import type { WorkspaceMember } from '../src/types/domain';

describe('WorkspaceMember', () => {
  it('represents the effective tenant admin role returned by member APIs', () => {
    const memberRole: WorkspaceMember['role'] = 'admin';

    expect(memberRole).toBe('admin');
  });
});
