import { DependencyType } from '@wrike-clone/shared';

import {
  criticalPathTaskIds,
  type DependencyEdge,
  wouldCreateCycle,
} from './dependency-graph';

const fs = DependencyType.FINISH_TO_START;

function edge(
  taskId: string,
  dependsOnTaskId: string,
  dependencyType = fs,
  lagDays = 0,
): DependencyEdge {
  return { taskId, dependsOnTaskId, dependencyType, lagDays };
}

describe('wouldCreateCycle', () => {
  it('detects a candidate that closes a predecessor-to-dependent path', () => {
    expect(
      wouldCreateCycle([edge('b', 'a')], edge('a', 'b')),
    ).toBe(true);
  });

  it('rejects a self dependency before traversing the graph', () => {
    expect(wouldCreateCycle([], edge('a', 'a'))).toBe(true);
  });

  it('allows an unrelated candidate and duplicate edge', () => {
    const edges = [edge('b', 'a')];

    expect(wouldCreateCycle(edges, edge('d', 'c'))).toBe(false);
    expect(wouldCreateCycle(edges, edge('b', 'a'))).toBe(false);
  });

  it('treats malformed input containing an existing cycle as cyclic', () => {
    expect(
      wouldCreateCycle([edge('b', 'a'), edge('a', 'b')], edge('d', 'c')),
    ).toBe(true);
  });
});

describe('criticalPathTaskIds', () => {
  it('returns the longest finish-to-start path with lag and inclusive durations', () => {
    const tasks = [
      { id: 'a', startDate: '2026-08-01', dueDate: '2026-08-02' },
      { id: 'b', startDate: '2026-08-03', dueDate: '2026-08-04' },
      { id: 'c', startDate: '2026-08-01', dueDate: '2026-08-03' },
      { id: 'd', startDate: '2026-08-05', dueDate: '2026-08-05' },
      { id: 'unscheduled', startDate: null, dueDate: null },
    ];

    expect(
      criticalPathTaskIds(tasks, [
        edge('b', 'a'),
        edge('d', 'b', fs, 1),
        edge('d', 'unscheduled'),
      ]),
    ).toEqual(new Set(['a', 'b', 'd']));
  });

  it('uses explicit start/end anchor approximations for every dependency type', () => {
    const tasks = [
      { id: 'a', startDate: '2026-08-01', dueDate: '2026-08-02' },
      { id: 'b', startDate: '2026-08-03', dueDate: '2026-08-05' },
      { id: 'c', startDate: '2026-08-04', dueDate: '2026-08-05' },
      { id: 'd', startDate: '2026-08-06', dueDate: '2026-08-08' },
      { id: 'e', startDate: '2026-08-08', dueDate: '2026-08-08' },
    ];

    expect(
      criticalPathTaskIds(tasks, [
        edge('b', 'a', DependencyType.FINISH_TO_START, 1),
        edge('c', 'b', DependencyType.START_TO_START, 2),
        edge('d', 'c', DependencyType.FINISH_TO_FINISH, 1),
        edge('e', 'd', DependencyType.START_TO_FINISH, 1),
      ]),
    ).toEqual(new Set(['a', 'b', 'c', 'd']));
  });

  it('chooses task IDs deterministically when equally scored predecessors converge', () => {
    const tasks = [
      { id: 'a', startDate: '2026-08-01', dueDate: '2026-08-01' },
      { id: 'b', startDate: '2026-08-01', dueDate: '2026-08-01' },
      { id: 'd', startDate: '2026-08-02', dueDate: '2026-08-02' },
    ];

    expect(
      criticalPathTaskIds(tasks, [edge('d', 'b'), edge('d', 'a')]),
    ).toEqual(new Set(['a', 'd']));
  });

  it('rejects a scheduled dependency cycle instead of returning a partial path', () => {
    const tasks = [
      { id: 'a', startDate: '2026-08-01', dueDate: '2026-08-01' },
      { id: 'b', startDate: '2026-08-02', dueDate: '2026-08-02' },
    ];

    expect(() => criticalPathTaskIds(tasks, [edge('a', 'b'), edge('b', 'a')])).toThrow(
      'Dependency graph contains a cycle',
    );
  });
});
