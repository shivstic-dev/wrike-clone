import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import type { Folder } from '@wrike-clone/shared';

interface FolderTreeNodeProps {
  folder: Folder;
  childrenByParent: Map<string | null, Folder[]>;
  selectedFolderId?: string;
  onSelect?: (folder: Folder) => void;
  depth?: number;
}

function FolderTreeNode({
  folder,
  childrenByParent,
  selectedFolderId,
  onSelect,
  depth = 0,
}: FolderTreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const children = childrenByParent.get(folder.id) || [];
  const hasChildren = children.length > 0;
  const isSelected = selectedFolderId === folder.id;

  return (
    <li>
      <div className="flex min-w-0 items-center" style={{ paddingLeft: `${depth}rem` }}>
        {hasChildren ? (
          <button
            type="button"
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${folder.name}`}
            aria-expanded={isExpanded}
            onClick={() => setIsExpanded((current) => !current)}
            className="flex h-8 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          >
            <svg
              className={clsx('h-3 w-3 transition-transform', isExpanded && 'rotate-90')}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        ) : (
          <span className="w-7 shrink-0" aria-hidden="true" />
        )}
        <button
          type="button"
          onClick={() => onSelect?.(folder)}
          aria-current={isSelected ? 'true' : undefined}
          className={clsx(
            'flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
            isSelected
              ? 'bg-primary-50 font-semibold text-primary-700 shadow-sm ring-1 ring-primary-100'
              : 'text-slate-700 hover:bg-slate-100',
          )}
        >
          <svg
            className={clsx('h-4 w-4 shrink-0', isSelected ? 'text-primary-500' : 'text-amber-500')}
            fill="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M19.5 21a3 3 0 003-3v-4.5a3 3 0 00-3-3h-15a3 3 0 00-3 3V18a3 3 0 003 3h15zM1.5 9.5V9a3 3 0 013-3h3.67c.397 0 .785-.158 1.067-.44l1.126-1.126A1.5 1.5 0 0110.83 4H15a3 3 0 013 3v2.5" />
          </svg>
          <span className="truncate">{folder.name}</span>
        </button>
      </div>

      {hasChildren && isExpanded && (
        <ul className="mt-0.5 space-y-0.5">
          {children.map((child) => (
            <FolderTreeNode
              key={child.id}
              folder={child}
              childrenByParent={childrenByParent}
              selectedFolderId={selectedFolderId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

interface FolderTreeProps {
  folders: Folder[];
  selectedFolderId?: string;
  onSelect?: (folder: Folder) => void;
}

export function FolderTree({ folders, selectedFolderId, onSelect }: FolderTreeProps) {
  const childrenByParent = useMemo(() => {
    const grouped = new Map<string | null, Folder[]>();
    for (const folder of folders) {
      const parentId = folder.parentFolderId || null;
      const siblings = grouped.get(parentId);
      if (siblings) siblings.push(folder);
      else grouped.set(parentId, [folder]);
    }
    return grouped;
  }, [folders]);
  const rootFolders = childrenByParent.get(null) || [];

  if (rootFolders.length === 0) {
    return <p className="px-2 text-sm text-slate-400">No folders</p>;
  }

  return (
    <ul className="space-y-0.5" aria-label="Department folders">
      {rootFolders.map((folder) => (
        <FolderTreeNode
          key={folder.id}
          folder={folder}
          childrenByParent={childrenByParent}
          selectedFolderId={selectedFolderId}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}
