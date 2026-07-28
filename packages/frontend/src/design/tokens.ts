import type { TaskPriority, TaskStatus } from '@wrike-clone/shared';

export const operationsAtlasColors = {
  canopy: '#123C3A',
  current: '#25766F',
  fieldNote: '#F2CB67',
  signalCoral: '#F27B55',
  mist: '#DCE9E6',
  paper: '#F8FAF8',
  ink: '#183432',
} as const;

type StatusTone = 'neutral' | 'info' | 'positive' | 'danger';
type PriorityTone = 'neutral' | 'info' | 'warning' | 'danger';

export const statusTone = {
  todo: 'neutral',
  in_progress: 'info',
  completed: 'positive',
  blocked: 'danger',
} as const satisfies Readonly<Record<TaskStatus, StatusTone>>;

export const priorityTone = {
  low: 'neutral',
  medium: 'info',
  high: 'warning',
  critical: 'danger',
} as const satisfies Readonly<Record<TaskPriority, PriorityTone>>;
