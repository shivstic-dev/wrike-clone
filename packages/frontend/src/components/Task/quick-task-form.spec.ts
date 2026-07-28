import { describe, expect, it } from 'vitest';
import { TaskPriority } from '@wrike-clone/shared';
import {
  canCreateQuickTask,
  changeQuickTaskDepartment,
  createQuickTaskFormState,
  normalizeQuickTaskInput,
  permittedQuickTaskAssignees,
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

  it('allows quick task creation for tenant admins or department leaders', () => {
    expect(canCreateQuickTask([], 'admin')).toBe(true);
    expect(canCreateQuickTask([{ departmentRole: 'manager' }], 'member')).toBe(true);
    expect(canCreateQuickTask([{ departmentRole: 'employee' }], 'member')).toBe(false);
  });

  it('limits manager assignees to self and employees', () => {
    const members = [
      { userId: 'manager-1', role: 'manager' },
      { userId: 'employee-1', role: 'employee' },
      { userId: 'head-1', role: 'department_head' },
    ];

    expect(permittedQuickTaskAssignees(members, 'manager', 'manager-1')).toEqual([
      members[0],
      members[1],
    ]);
    expect(permittedQuickTaskAssignees(members, 'department_head', 'head-1')).toEqual(members);
  });
});
