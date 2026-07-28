// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Folder } from '@wrike-clone/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FolderTree } from './FolderTree';

const baseFolder = {
  tenantId: 'tenant-1',
  description: null,
  icon: null,
  sortOrder: 0,
  isArchived: false,
  isSystemGeneral: false,
  metadata: {},
  createdAt: '2026-07-28T00:00:00.000Z',
  updatedAt: '2026-07-28T00:00:00.000Z',
  deletedAt: null,
};

const folders: Folder[] = [
  {
    ...baseFolder,
    id: 'folder-parent',
    workspaceId: 'department-1',
    parentFolderId: null,
    name: 'Programs',
  },
  {
    ...baseFolder,
    id: 'folder-child',
    workspaceId: 'department-1',
    parentFolderId: 'folder-parent',
    name: 'Education',
  },
];

let container: HTMLDivElement;
let root: Root | undefined;

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = undefined;
  }
  document.body.innerHTML = '';
});

describe('FolderTree', () => {
  it('selects recursive folder nodes without collapsing their children', () => {
    const onSelect = vi.fn();
    act(() => {
      root = createRoot(container);
      root.render(
        <FolderTree
          folders={folders}
          selectedFolderId="folder-parent"
          onSelect={onSelect}
        />,
      );
    });

    const parent = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('Programs'),
    );
    if (!parent) throw new Error('Parent folder was not rendered');

    expect(parent.getAttribute('aria-current')).toBe('true');
    act(() => parent.click());

    expect(onSelect).toHaveBeenCalledWith(folders[0]);
    expect(container.textContent).toContain('Education');
  });

  it('keeps expand and collapse available independently from selection', () => {
    const onSelect = vi.fn();
    act(() => {
      root = createRoot(container);
      root.render(<FolderTree folders={folders} onSelect={onSelect} />);
    });

    const disclosure = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Collapse Programs"]',
    );
    if (!disclosure) throw new Error('Folder disclosure was not rendered');
    act(() => disclosure.click());

    expect(container.textContent).not.toContain('Education');
    expect(onSelect).not.toHaveBeenCalled();
  });
});
