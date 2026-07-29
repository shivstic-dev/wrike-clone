import { useCallback, useRef, useState } from 'react';
import type { Task, TaskCompletionOutcome } from '@wrike-clone/shared';
import { useCompleteTask } from '../../api/tasks';
import type { HandoffCompletionDialogProps } from './HandoffCompletionDialog';

interface PendingCompletion {
  task: Task;
  resolve: (task: Task | null) => void;
  reject: (error: Error) => void;
}

export function useTaskCompletionFlow(): {
  requestCompletion: (task: Task) => Promise<Task | null>;
  dialogProps: HandoffCompletionDialogProps;
} {
  const completeTask = useCompleteTask();
  const [taskAwaitingConfirmation, setTaskAwaitingConfirmation] = useState<Task | null>(null);
  const pendingCompletionRef = useRef<PendingCompletion | null>(null);

  const resolveOutcome = useCallback(
    async (outcome: TaskCompletionOutcome) => {
      const pendingCompletion = pendingCompletionRef.current;
      if (!pendingCompletion || completeTask.isPending) return;

      try {
        const completedTask = await completeTask.mutateAsync({
          taskId: pendingCompletion.task.id,
          outcome,
        });
        pendingCompletion.resolve(completedTask);
      } catch (error) {
        pendingCompletion.reject(error instanceof Error ? error : new Error('Task completion failed'));
      } finally {
        pendingCompletionRef.current = null;
        setTaskAwaitingConfirmation(null);
      }
    },
    [completeTask],
  );

  const cancel = useCallback(() => {
    const pendingCompletion = pendingCompletionRef.current;
    if (!pendingCompletion || completeTask.isPending) return;

    pendingCompletionRef.current = null;
    setTaskAwaitingConfirmation(null);
    pendingCompletion.resolve(null);
  }, [completeTask.isPending]);

  const requestCompletion = useCallback(
    async (task: Task): Promise<Task | null> => {
      if (!task.handoffRequired) {
        return completeTask.mutateAsync({ taskId: task.id, outcome: 'confirmed' });
      }

      return new Promise<Task | null>((resolve, reject) => {
        pendingCompletionRef.current = { task, resolve, reject };
        setTaskAwaitingConfirmation(task);
      });
    },
    [completeTask],
  );

  return {
    requestCompletion,
    dialogProps: {
      open: taskAwaitingConfirmation !== null,
      task: taskAwaitingConfirmation,
      isPending: completeTask.isPending,
      onConfirm: () => void resolveOutcome('confirmed'),
      onNotYet: () => void resolveOutcome('not_yet'),
      onCancel: cancel,
    },
  };
}
