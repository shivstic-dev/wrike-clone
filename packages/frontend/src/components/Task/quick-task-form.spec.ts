import { describe, expect, it } from 'vitest';
import { TaskPriority } from '@wrike-clone/shared';
import {
  canCreateQuickTask,
  canSetQuickTaskVisibility,
  changeQuickTaskFolder,
  changeQuickTaskDepartment,
  createQuickTaskFormState,
  creatableQuickTaskDepartments,
  normalizeQuickTaskInput,
  permittedQuickTaskAssignees,
  resolveQuickTaskInitialDepartmentId,
} from './quick-task-form';

describe('quick task form helpers', () => {
  it('creates a department-scoped form state', () => {
    expect(createQuickTaskFormState('department-1')).toEqual({
      title: '',
      departmentId: 'department-1',
      folderId: '',
      projectId: '',
      assigneeIds: [],
      dueDate: '',
      description: '',
      priority: TaskPriority.LOW,
      startDate: '',
      estimatedHours: '',
      visibility: 'department',
    });
  });

  it('normalizes quick task state into the approved create request fields', () => {
    expect(
      normalizeQuickTaskInput({
        ...createQuickTaskFormState('department-1'),
        title: '  Publish launch banner  ',
        folderId: 'folder-1',
        assigneeIds: ['user-1'],
        dueDate: '2026-07-31',
        description: '  Prepare the final artwork.  ',
        priority: TaskPriority.HIGH,
        startDate: '2026-07-29',
        estimatedHours: 3.5,
        visibility: 'global',
      }),
    ).toEqual({
      title: 'Publish launch banner',
      departmentId: 'department-1',
      folderId: 'folder-1',
      projectId: undefined,
      assigneeIds: ['user-1'],
      dueDate: '2026-07-31T00:00:00.000Z',
      description: 'Prepare the final artwork.',
      priority: TaskPriority.HIGH,
      startDate: '2026-07-29T00:00:00.000Z',
      estimatedHours: 3.5,
      visibility: 'global',
    });
  });

  it('omits blank optional location, date, description, and estimate values', () => {
    expect(
      normalizeQuickTaskInput({
        ...createQuickTaskFormState('department-1'),
        title: '  Banner  ',
        folderId: '   ',
        projectId: '   ',
        description: '   ',
      }),
    ).toEqual({
      title: 'Banner',
      departmentId: 'department-1',
      folderId: undefined,
      projectId: undefined,
      assigneeIds: [],
      dueDate: undefined,
      description: undefined,
      priority: TaskPriority.LOW,
      startDate: undefined,
      estimatedHours: undefined,
      visibility: 'department',
    });
  });

  it.each(['   ', 'not-a-date'])('omits invalid due and start dates: %s', (dateValue) => {
    const state = {
      ...createQuickTaskFormState('department-1'),
      dueDate: dateValue,
      startDate: dateValue,
    };

    expect(() => normalizeQuickTaskInput(state)).not.toThrow();
    expect(normalizeQuickTaskInput(state)).toMatchObject({
      dueDate: undefined,
      startDate: undefined,
    });
  });

  it.each([NaN, Infinity])('omits a non-finite estimated hour value', (estimatedHours) => {
    expect(
      normalizeQuickTaskInput({
        ...createQuickTaskFormState('department-1'),
        estimatedHours,
      }),
    ).toMatchObject({ estimatedHours: undefined });
  });

  it('omits a negative estimated hour value', () => {
    expect(
      normalizeQuickTaskInput({
        ...createQuickTaskFormState('department-1'),
        estimatedHours: -0.25,
      }),
    ).toMatchObject({ estimatedHours: undefined });
  });

  it('preserves a finite nonnegative estimated hour value', () => {
    expect(
      normalizeQuickTaskInput({
        ...createQuickTaskFormState('department-1'),
        estimatedHours: 2.25,
      }),
    ).toMatchObject({ estimatedHours: 2.25 });
  });

  it('clears location and assignee state when the department changes', () => {
    expect(
      changeQuickTaskDepartment(
        {
          ...createQuickTaskFormState('department-1'),
          folderId: 'folder-1',
          projectId: 'project-1',
          assigneeIds: ['user-1'],
        },
        'department-2',
      ),
    ).toMatchObject({
      departmentId: 'department-2',
      folderId: '',
      projectId: '',
      assigneeIds: [],
    });
  });

  it('hides quick task from employee-only users', () => {
    expect(canCreateQuickTask([{ id: 'dept-1', departmentRole: 'employee' }], 'member')).toBe(
      false,
    );
  });

  it('shows quick task to a department manager', () => {
    expect(canCreateQuickTask([{ id: 'dept-1', departmentRole: 'manager' }], 'member')).toBe(true);
  });

  it('shows quick task to tenant admins without a department', () => {
    expect(canCreateQuickTask([], 'admin')).toBe(true);
  });

  it('preselects the department supplied by the current route', () => {
    expect(createQuickTaskFormState('dept-1').departmentId).toBe('dept-1');
  });

  it('preselects a route department only when it is available to create in', () => {
    const departments = [{ id: 'dept-1' }, { id: 'dept-2' }];

    expect(resolveQuickTaskInitialDepartmentId('dept-2', departments)).toBe('dept-2');
    expect(resolveQuickTaskInitialDepartmentId('employee-only-dept', departments)).toBe('');
  });

  it('lists every department for tenant admins and only managed departments for members', () => {
    const departments = [
      { id: 'dept-admin', departmentRole: 'admin' },
      { id: 'dept-head', departmentRole: 'department_head' },
      { id: 'dept-manager', departmentRole: 'manager' },
      { id: 'dept-employee', departmentRole: 'employee' },
    ];

    expect(
      creatableQuickTaskDepartments(departments, 'member').map((department) => department.id),
    ).toEqual(['dept-admin', 'dept-head', 'dept-manager']);
    expect(
      creatableQuickTaskDepartments(departments, 'admin').map((department) => department.id),
    ).toEqual(['dept-admin', 'dept-head', 'dept-manager', 'dept-employee']);
  });

  it('clears the selected project when the folder changes', () => {
    expect(
      changeQuickTaskFolder(
        {
          ...createQuickTaskFormState('dept-1'),
          folderId: 'folder-1',
          projectId: 'project-1',
        },
        'folder-2',
      ),
    ).toMatchObject({
      folderId: 'folder-2',
      projectId: '',
    });
  });

  it('shows visibility only to tenant admins and department admins or heads', () => {
    expect(canSetQuickTaskVisibility('admin', 'employee')).toBe(true);
    expect(canSetQuickTaskVisibility('member', 'admin')).toBe(true);
    expect(canSetQuickTaskVisibility('member', 'department_head')).toBe(true);
    expect(canSetQuickTaskVisibility('member', 'manager')).toBe(false);
  });

  it('limits manager assignees to self and employees', () => {
    const members = [
      { userId: 'manager-1', role: 'manager' },
      { userId: 'manager-2', role: 'manager' },
      { userId: 'employee-1', role: 'employee' },
      { userId: 'head-1', role: 'department_head' },
      { userId: 'admin-1', role: 'admin' },
    ];

    expect(
      permittedQuickTaskAssignees(members, 'manager', 'manager-1').map((member) => member.userId),
    ).toEqual(['manager-1', 'employee-1']);
  });

  it('never offers tenant admins as quick task assignees', () => {
    const members = [
      { userId: 'head-1', role: 'department_head' },
      { userId: 'employee-1', role: 'employee' },
      { userId: 'admin-1', role: 'admin' },
    ];

    expect(
      permittedQuickTaskAssignees(members, 'department_head', 'head-1').map(
        (member) => member.userId,
      ),
    ).toEqual(['head-1', 'employee-1']);
    expect(
      permittedQuickTaskAssignees(members, 'admin', 'admin-viewer').map((member) => member.userId),
    ).toEqual(['head-1', 'employee-1']);
  });
});
