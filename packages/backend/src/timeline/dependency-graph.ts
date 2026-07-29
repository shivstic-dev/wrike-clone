import { DependencyType } from '@wrike-clone/shared';

export interface DependencyEdge {
  taskId: string;
  dependsOnTaskId: string;
  dependencyType: DependencyType;
  lagDays: number;
}

interface TimelineTaskInput {
  id: string;
  startDate: string | null;
  dueDate: string | null;
}

interface ScheduledTask {
  id: string;
  durationDays: number;
  plannedStart: number;
}

interface TaskScore {
  start: number;
  end: number;
  predecessorId: string | null;
}

const millisecondsPerDay = 24 * 60 * 60 * 1000;

const dependencyTypes = new Set<DependencyType>(Object.values(DependencyType));

/**
 * Returns true when adding `candidate` makes the predecessor-to-dependent
 * graph cyclic. Existing malformed cycles are also reported as cyclic so a
 * caller never accepts an edge against an already unsafe graph.
 */
export function wouldCreateCycle(
  edges: DependencyEdge[],
  candidate: DependencyEdge,
): boolean {
  if (candidate.taskId === candidate.dependsOnTaskId) {
    return true;
  }

  const adjacency = new Map<string, Set<string>>();
  for (const edge of [...edges, candidate]) {
    addAdjacent(adjacency, edge.dependsOnTaskId, edge.taskId);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (taskId: string): boolean => {
    if (visiting.has(taskId)) {
      return true;
    }
    if (visited.has(taskId)) {
      return false;
    }

    visiting.add(taskId);
    for (const dependentId of sorted(adjacency.get(taskId) ?? [])) {
      if (visit(dependentId)) {
        return true;
      }
    }
    visiting.delete(taskId);
    visited.add(taskId);
    return false;
  };

  return sorted(adjacency.keys()).some(visit);
}

/**
 * Finds one deterministic critical path among scheduled tasks.
 *
 * Scores use inclusive UTC-day durations. Each task begins at its supplied
 * scheduled date relative to the earliest scheduled task; dependency bounds
 * can only push it later. Non-FS constraints are approximated by the anchors
 * they constrain: SS uses predecessor start -> dependent start, FF uses
 * predecessor finish -> dependent finish, and SF uses predecessor start ->
 * dependent finish. A zero-lag FS edge starts on the day after its predecessor
 * finishes. Equal bounds and equal terminal scores choose the lower task ID.
 */
export function criticalPathTaskIds(
  tasks: TimelineTaskInput[],
  edges: DependencyEdge[],
): Set<string> {
  const scheduledTasks = toScheduledTasks(tasks);
  if (scheduledTasks.size === 0) {
    return new Set();
  }

  const graphEdges = normalizeScheduledEdges(edges, scheduledTasks);
  const { order, incoming } = topologicalOrder(scheduledTasks, graphEdges);
  const scores = new Map<string, TaskScore>();

  for (const taskId of order) {
    const task = scheduledTasks.get(taskId)!;
    let start = task.plannedStart;
    let predecessorId: string | null = null;

    for (const edge of incoming.get(taskId) ?? []) {
      const predecessor = scores.get(edge.dependsOnTaskId)!;
      const requiredStart = requiredStartDay(predecessor, task.durationDays, edge);

      if (
        requiredStart > start ||
        (requiredStart === start &&
          (predecessorId === null || edge.dependsOnTaskId < predecessorId))
      ) {
        start = requiredStart;
        predecessorId = edge.dependsOnTaskId;
      }
    }

    scores.set(taskId, {
      start,
      end: start + task.durationDays - 1,
      predecessorId,
    });
  }

  const terminalId = sorted(scores.keys()).reduce<string | null>((best, taskId) => {
    if (best === null || scores.get(taskId)!.end > scores.get(best)!.end) {
      return taskId;
    }
    return best;
  }, null);

  const path = new Set<string>();
  for (let current = terminalId; current !== null; current = scores.get(current)!.predecessorId) {
    path.add(current);
  }
  return path;
}

function toScheduledTasks(tasks: TimelineTaskInput[]): Map<string, ScheduledTask> {
  const parsed = tasks
    .filter((task) => task.startDate !== null && task.dueDate !== null)
    .map((task) => ({
      id: task.id,
      start: utcDay(task.startDate!),
      due: utcDay(task.dueDate!),
    }));

  for (const task of parsed) {
    if (task.due < task.start) {
      throw new RangeError(`Task ${task.id} has an invalid schedule range`);
    }
  }

  const earliestStart = Math.min(...parsed.map((task) => task.start));
  const scheduled = new Map<string, ScheduledTask>();
  for (const task of parsed) {
    if (scheduled.has(task.id)) {
      throw new RangeError(`Duplicate task id: ${task.id}`);
    }
    scheduled.set(task.id, {
      id: task.id,
      durationDays: task.due - task.start + 1,
      plannedStart: task.start - earliestStart + 1,
    });
  }
  return scheduled;
}

function normalizeScheduledEdges(
  edges: DependencyEdge[],
  scheduledTasks: Map<string, ScheduledTask>,
): DependencyEdge[] {
  const normalized = new Map<string, DependencyEdge>();
  for (const edge of edges) {
    validateEdge(edge);
    if (!scheduledTasks.has(edge.taskId) || !scheduledTasks.has(edge.dependsOnTaskId)) {
      continue;
    }

    const key = `${edge.taskId}\u0000${edge.dependsOnTaskId}`;
    const current = normalized.get(key);
    if (current === undefined || compareEdges(edge, current) < 0) {
      normalized.set(key, edge);
    }
  }
  return [...normalized.values()].sort(compareEdges);
}

function topologicalOrder(
  tasks: Map<string, ScheduledTask>,
  edges: DependencyEdge[],
): { order: string[]; incoming: Map<string, DependencyEdge[]> } {
  const indegree = new Map(sorted(tasks.keys()).map((taskId) => [taskId, 0]));
  const adjacency = new Map<string, Set<string>>();
  const incoming = new Map<string, DependencyEdge[]>();

  for (const edge of edges) {
    addAdjacent(adjacency, edge.dependsOnTaskId, edge.taskId);
    indegree.set(edge.taskId, indegree.get(edge.taskId)! + 1);
    const taskIncoming = incoming.get(edge.taskId) ?? [];
    taskIncoming.push(edge);
    incoming.set(edge.taskId, taskIncoming);
  }
  for (const taskIncoming of incoming.values()) {
    taskIncoming.sort(compareEdges);
  }

  const ready = sorted(
    [...indegree.entries()]
      .filter(([, count]) => count === 0)
      .map(([taskId]) => taskId),
  );
  const order: string[] = [];

  while (ready.length > 0) {
    const taskId = ready.shift()!;
    order.push(taskId);
    for (const dependentId of sorted(adjacency.get(taskId) ?? [])) {
      const nextIndegree = indegree.get(dependentId)! - 1;
      indegree.set(dependentId, nextIndegree);
      if (nextIndegree === 0) {
        insertSorted(ready, dependentId);
      }
    }
  }

  if (order.length !== tasks.size) {
    throw new RangeError('Dependency graph contains a cycle');
  }

  return { order, incoming };
}

function requiredStartDay(
  predecessor: TaskScore,
  dependentDuration: number,
  edge: DependencyEdge,
): number {
  switch (edge.dependencyType) {
    case DependencyType.FINISH_TO_START:
      return predecessor.end + edge.lagDays + 1;
    case DependencyType.START_TO_START:
      return predecessor.start + edge.lagDays;
    case DependencyType.FINISH_TO_FINISH:
      return predecessor.end + edge.lagDays - dependentDuration + 1;
    case DependencyType.START_TO_FINISH:
      return predecessor.start + edge.lagDays - dependentDuration + 1;
  }
}

function validateEdge(edge: DependencyEdge): void {
  if (edge.taskId === edge.dependsOnTaskId) {
    throw new RangeError('Dependency graph contains a cycle');
  }
  if (!dependencyTypes.has(edge.dependencyType)) {
    throw new RangeError(`Unsupported dependency type: ${edge.dependencyType}`);
  }
  if (!Number.isInteger(edge.lagDays) || edge.lagDays < 0) {
    throw new RangeError(`Invalid dependency lag: ${edge.lagDays}`);
  }
}

function utcDay(value: string): number {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) {
    throw new RangeError(`Invalid task schedule date: ${value}`);
  }
  return Math.floor(time / millisecondsPerDay);
}

function addAdjacent(adjacency: Map<string, Set<string>>, from: string, to: string): void {
  const dependents = adjacency.get(from) ?? new Set<string>();
  dependents.add(to);
  adjacency.set(from, dependents);
  if (!adjacency.has(to)) {
    adjacency.set(to, new Set());
  }
}

function compareEdges(left: DependencyEdge, right: DependencyEdge): number {
  return (
    left.taskId.localeCompare(right.taskId) ||
    left.dependsOnTaskId.localeCompare(right.dependsOnTaskId) ||
    left.dependencyType.localeCompare(right.dependencyType) ||
    left.lagDays - right.lagDays
  );
}

function insertSorted(values: string[], value: string): void {
  const index = values.findIndex((current) => current > value);
  if (index === -1) {
    values.push(value);
  } else {
    values.splice(index, 0, value);
  }
}

function sorted<T extends string>(values: Iterable<T>): T[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}
