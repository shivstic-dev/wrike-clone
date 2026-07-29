import { useCallback, useEffect, useRef, useState } from 'react';
import type { Task, TaskCompletionOutcome } from '@wrike-clone/shared';
import { useCompleteTask } from '../../api/tasks';
import type { HandoffCompletionDialogProps } from './HandoffCompletionDialog';

interface PendingCompletion {
  task: Task;
  promise: Promise<Task | null>;
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
  const isResolvingRef = useRef(false);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      isResolvingRef.current = false;
      const pendingCompletion = pendingCompletionRef.current;
      pendingCompletionRef.current = null;
      pendingCompletion?.resolve(null);
    };
  }, []);

  const resolveOutcome = useCallback(
    async (outcome: TaskCompletionOutcome) => {
      const pendingCompletion = pendingCompletionRef.current;
      if (!pendingCompletion || completeTask.isPending || isResolvingRef.current) return;

      isResolvingRef.current = true;

      try {
        const completedTask = await completeTask.mutateAsync({
          taskId: pendingCompletion.task.id,
          outcome,
        });
        if (pendingCompletionRef.current === pendingCompletion) {
          pendingCompletionRef.current = null;
          if (isMountedRef.current) setTaskAwaitingConfirmation(null);
          pendingCompletion.resolve(completedTask);
        }
      } catch (error) {
        if (pendingCompletionRef.current === pendingCompletion) {
          pendingCompletionRef.current = null;
          if (isMountedRef.current) setTaskAwaitingConfirmation(null);
          pendingCompletion.reject(
            error instanceof Error ? error : new Error('Task completion failed'),
          );
        }
      } finally {
        isResolvingRef.current = false;
      }
    },
    [completeTask],
  );

  const cancel = useCallback(() => {
    const pendingCompletion = pendingCompletionRef.current;
    if (!pendingCompletion || completeTask.isPending || isResolvingRef.current) return;

    pendingCompletionRef.current = null;
    if (isMountedRef.current) setTaskAwaitingConfirmation(null);
    pendingCompletion.resolve(null);
  }, [completeTask.isPending]);

  const requestCompletion = useCallback(
    (task: Task): Promise<Task | null> => {
      if (!task.handoffRequired) {
        return completeTask.mutateAsync({ taskId: task.id, outcome: 'confirmed' });
      }

      const currentPendingCompletion = pendingCompletionRef.current;
      if (currentPendingCompletion) return currentPendingCompletion.promise;

      let resolvePromise: (task: Task | null) => void = () => undefined;
      let rejectPromise: (error: Error) => void = () => undefined;
      const promise = new Promise<Task | null>((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
      });

      pendingCompletionRef.current = {
        task,
        promise,
        resolve: resolvePromise,
        reject: rejectPromise,
      };
      setTaskAwaitingConfirmation(task);
      return promise;
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
