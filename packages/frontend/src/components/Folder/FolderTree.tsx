import { useState } from 'react';
import { clsx } from 'clsx';
import type { Folder } from '@wrike-clone/shared';

interface FolderTreeNodeProps {
  folder: Folder;
  allFolders: Folder[];
  depth?: number;
}

function FolderTreeNode({ folder, allFolders, depth = 0 }: FolderTreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const children = allFolders.filter((f) => f.parentFolderId === folder.id);
  const hasChildren = children.length > 0;

  return (
    <div>
      <button
        onClick={() => hasChildren && setIsExpanded(!isExpanded)}
        className={clsx(
          'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-slate-100',
          depth > 0 && 'ml-4',
        )}
      >
        {hasChildren && (
          <svg
            className={clsx(
              'h-3 w-3 shrink-0 text-slate-400 transition-transform',
              isExpanded && 'rotate-90',
            )}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        )}
        {!hasChildren && <span className="w-3 shrink-0" />}
        <svg className="h-4 w-4 shrink-0 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
          <path d="M19.5 21a3 3 0 003-3v-4.5a3 3 0 00-3-3h-15a3 3 0 00-3 3V18a3 3 0 003 3h15zM1.5 9.5V9a3 3 0 013-3h3.67c.397 0 .785-.158 1.067-.44l1.126-1.126A1.5 1.5 0 0110.83 4H15a3 3 0 013 3v2.5" />
        </svg>
        <span className="truncate text-slate-700">{folder.name}</span>
      </button>

      {hasChildren && isExpanded && (
        <div className="mt-0.5">
          {children.map((child) => (
            <FolderTreeNode
              key={child.id}
              folder={child}
              allFolders={allFolders}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface FolderTreeProps {
  folders: Folder[];
}

export function FolderTree({ folders }: FolderTreeProps) {
  // Only render root folders (no parent)
  const rootFolders = folders.filter((f) => !f.parentFolderId);

  if (rootFolders.length === 0) {
    return <p className="px-2 text-sm text-slate-400">No folders</p>;
  }

  return (
    <div className="space-y-0.5">
      {rootFolders.map((folder) => (
        <FolderTreeNode key={folder.id} folder={folder} allFolders={folders} />
      ))}
    </div>
  );
}
