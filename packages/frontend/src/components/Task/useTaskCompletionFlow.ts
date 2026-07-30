import { useState, useCallback } from 'react';
import type { Task } from '@wrike-clone/shared';
import { useCompleteTask } from '../../api/tasks';
import toast from 'react-hot-toast';

export function useTaskCompletionFlow() {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const completeTask = useCompleteTask();

  const handleConfirm = useCallback(async () => {
    if (!activeTask) return;
    try {
      await completeTask.mutateAsync({ taskId: activeTask.id, outcome: 'confirmed' });
      toast.success('Handoff confirmed and task completed');
      setIsDialogOpen(false);
      setActiveTask(null);
    } catch (error) {
      toast.error('Failed to confirm handoff');
    }
  }, [activeTask, completeTask]);

  const handleNotYet = useCallback(async () => {
    if (!activeTask) return;
    try {
      await completeTask.mutateAsync({ taskId: activeTask.id, outcome: 'not_yet' });
      toast('Saved in Ready for handoff', { icon: 'ℹ️' });
      setIsDialogOpen(false);
      setActiveTask(null);
    } catch (error) {
      toast.error('Failed to update task state');
    }
  }, [activeTask, completeTask]);

  const handleCancel = useCallback(() => {
    setIsDialogOpen(false);
    setActiveTask(null);
  }, []);

  const requestCompletion = useCallback(
    async (task: Task): Promise<boolean> => {
      if (task.handoffRequired === false) {
        try {
          await completeTask.mutateAsync({ taskId: task.id, outcome: 'confirmed' });
          toast.success('Task completed');
          return true;
        } catch {
          toast.error('Failed to complete task');
          return false;
        }
      } else {
        setActiveTask(task);
        setIsDialogOpen(true);
        return false;
      }
    },
    [completeTask],
  );

  return {
    requestCompletion,
    isDialogOpen,
    activeTask,
    isSubmitting: completeTask.isPending,
    dialogProps: {
      open: isDialogOpen,
      task: activeTask,
      isSubmitting: completeTask.isPending,
      onConfirm: handleConfirm,
      onNotYet: handleNotYet,
      onCancel: handleCancel,
    },
  };
}
