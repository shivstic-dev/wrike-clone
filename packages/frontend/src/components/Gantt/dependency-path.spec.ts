import { describe, expect, it } from 'vitest';
import { DependencyType } from '@wrike-clone/shared';
import { dependencyAnchors, dependencyPath } from './dependency-path';

const predecessor = { left: 10, right: 80, y: 22 };
const dependent = { left: 120, right: 180, y: 66 };

describe('dependency paths', () => {
  it('uses the stable task-edge anchors for every dependency type', () => {
    const fs = dependencyAnchors(DependencyType.FINISH_TO_START, predecessor, dependent);
    expect(fs).toEqual({ fromX: predecessor.right, toX: dependent.left });
    expect(dependencyAnchors(DependencyType.START_TO_START, predecessor, dependent).fromX).toBe(predecessor.left);
    expect(dependencyAnchors(DependencyType.FINISH_TO_FINISH, predecessor, dependent).toX).toBe(dependent.right);
  });

  it('creates visible elbows for backward and same-row links without moving anchors', () => {
    const backward = dependencyPath(DependencyType.FINISH_TO_START, { left: 180, right: 240, y: 22 }, { left: 100, right: 150, y: 22 });
    expect(backward.points[0]).toEqual({ x: 240, y: 22 });
    expect(backward.points.at(-1)).toEqual({ x: 100, y: 22 });
    expect(backward.points.some((point) => point.x >= 252)).toBe(true);
    expect(backward.path).toMatch(/^M 240 22 L /);
  });
});
