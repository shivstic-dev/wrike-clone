import type { DependencyType } from '@wrike-clone/shared';

export interface DependencyBarBounds {
  left: number;
  right: number;
  y: number;
}

export interface DependencyAnchors {
  fromX: number;
  toX: number;
}

export interface DependencyPath {
  anchors: DependencyAnchors;
  points: Array<{ x: number; y: number }>;
  path: string;
}

export function dependencyAnchors(
  type: DependencyType,
  predecessor: DependencyBarBounds,
  dependent: DependencyBarBounds,
): DependencyAnchors {
  switch (type) {
    case 'start_to_start':
      return { fromX: predecessor.left, toX: dependent.left };
    case 'finish_to_finish':
      return { fromX: predecessor.right, toX: dependent.right };
    case 'start_to_finish':
      return { fromX: predecessor.left, toX: dependent.right };
    case 'finish_to_start':
    default:
      return { fromX: predecessor.right, toX: dependent.left };
  }
}

/** Returns a DOM-independent SVG polyline with stable bar-edge anchors. */
export function dependencyPath(
  type: DependencyType,
  predecessor: DependencyBarBounds,
  dependent: DependencyBarBounds,
): DependencyPath {
  const anchors = dependencyAnchors(type, predecessor, dependent);
  const from = { x: anchors.fromX, y: predecessor.y };
  const to = { x: anchors.toX, y: dependent.y };
  const isBackwardOrSameRow = to.x <= from.x || to.y === from.y;
  const elbowX = isBackwardOrSameRow
    ? Math.max(from.x, to.x) + 12
    : from.x + Math.max(12, (to.x - from.x) / 2);
  const points = [from, { x: elbowX, y: from.y }, { x: elbowX, y: to.y }, to];
  return {
    anchors,
    points,
    path: points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
      .join(' '),
  };
}
