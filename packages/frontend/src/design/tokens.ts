import type { TaskPriority, TaskStatus } from '@wrike-clone/shared';

export const operationsAtlasColors = {
  canopy: '#0D3B2A',
  current: '#147A50',
  fieldNote: '#B7D96B',
  signalCoral: '#D85F5F',
  mist: '#DDE5E0',
  paper: '#F3F5F3',
  ink: '#181C1A',
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
