import { describe, expect, it } from 'vitest';
import { TaskPriority, TaskStatus, type Task } from '@wrike-clone/shared';
import { canMoveDashboardTask, filterDashboardTasks } from './dashboard-board';

const task: Task = {
  id: 'task-1',
  tenantId: 'tenant-1',
  projectId: 'project-1',
  projectName: 'Community launch',
  departmentId: 'department-1',
  parentTaskId: null,
  assigneeId: null,
  assignees: [],
  createdById: 'creator-1',
  title: 'Prepare launch brief',
  description: null,
  status: TaskStatus.TODO,
  priority: TaskPriority.HIGH,
  estimatedHours: null,
  actualHours: null,
  startDate: null,
  dueDate: '2026-08-05T00:00:00.000Z',
  completedAt: null,
  visibility: 'department',
  sortOrder: 0,
  customFields: {},
  isRecurring: false,
  recurrenceRule: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  deletedAt: null,
};
const members = [
  { userId: 'manager-1', role: 'manager' as const, displayName: 'Atul', email: 'atul@example.com' },
  {
    userId: 'manager-2',
    role: 'manager' as const,
    displayName: 'Shivam',
    email: 'shivam@example.com',
  },
  {
    userId: 'employee-1',
    role: 'employee' as const,
    displayName: 'Aparna',
    email: 'aparna@example.com',
  },
];

describe('dashboard board policy and filters', () => {
  it('keeps peer-manager tasks view-only while allowing a manager to move employee work', () => {
    expect(
      canMoveDashboardTask({ ...task, assigneeId: 'manager-2' }, 'manager-1', 'manager', members),
    ).toBe(false);
    expect(
      canMoveDashboardTask({ ...task, assigneeId: 'employee-1' }, 'manager-1', 'manager', members),
    ).toBe(true);
  });
  it('allows employees only assigned tasks and lets heads move visible tasks', () => {
    expect(
      canMoveDashboardTask(
        { ...task, assigneeId: 'employee-1' },
        'employee-1',
        'employee',
        members,
      ),
    ).toBe(true);
    expect(canMoveDashboardTask(task, 'employee-1', 'employee', members)).toBe(false);
    expect(canMoveDashboardTask(task, 'head-1', 'department_head', members)).toBe(true);
  });
  it('combines board filters', () => {
    const result = filterDashboardTasks(
      [
        { ...task, assigneeId: 'employee-1' },
        { ...task, id: 'task-2', projectId: 'project-2', title: 'Other' },
      ],
      {
        search: 'launch',
        projectId: 'project-1',
        assigneeId: 'employee-1',
        priority: 'high',
        due: 'overdue',
      },
      new Date('2026-08-08T12:00:00.000Z'),
    );
    expect(result.map(({ id }) => id)).toEqual(['task-1']);
  });
});
