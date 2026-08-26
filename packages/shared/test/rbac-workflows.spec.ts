import {
  addTaskAssigneeSchema,
  changeDepartmentMemberRoleSchema,
  createTaskSchema,
  departmentReportFilterSchema,
} from '../src/validation';

const firstUser = '00000000-0000-0000-0000-000000000001';
const secondUser = '00000000-0000-0000-0000-000000000002';

describe('RBAC workflow validation', () => {
  it('accepts multiple task assignees', () => {
    const result = createTaskSchema.parse({
      projectId: '00000000-0000-0000-0000-000000000010',
      title: 'Shared task',
      assigneeIds: [firstUser, secondUser],
    });
    expect(result.assigneeIds).toEqual([firstUser, secondUser]);
  });

  it('limits operational role changes to employee and manager', () => {
    expect(changeDepartmentMemberRoleSchema.parse({ role: 'manager' })).toEqual({
      role: 'manager',
    });
    expect(() => changeDepartmentMemberRoleSchema.parse({ role: 'department_head' })).toThrow();
  });

  it('requires a target for individual reports', () => {
    expect(() => departmentReportFilterSchema.parse({ scope: 'individual' })).toThrow();
    expect(
      departmentReportFilterSchema.parse({
        scope: 'individual',
        targetUserId: firstUser,
      }).targetUserId,
    ).toBe(firstUser);
  });

  it('validates task assignee mutation payloads', () => {
    expect(addTaskAssigneeSchema.parse({ userId: firstUser })).toEqual({ userId: firstUser });
  });
});
