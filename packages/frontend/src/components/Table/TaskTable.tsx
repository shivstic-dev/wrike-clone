import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type ColumnFiltersState,
  type RowSelectionState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { clsx } from 'clsx';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { EmptyState } from '../common/EmptyState';
import type { Task, TaskStatus, TaskPriority } from '@wrike-clone/shared';

const columnHelper = createColumnHelper<Task>();

const statusBadge: Record<TaskStatus, string> = {
  todo: 'badge-todo',
  in_progress: 'badge-in_progress',
  completed: 'badge-done',
  blocked: 'badge-cancelled',
};

const priorityClass: Record<TaskPriority, string> = {
  low: 'priority-low',
  medium: 'priority-medium',
  high: 'priority-high',
  critical: 'priority-urgent',
};

interface TaskTableProps {
  tasks: Task[];
  isLoading?: boolean;
}

export function TaskTable({ tasks, isLoading }: TaskTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = useState('');

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            checked={table.getIsAllRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
          />
        ),
        size: 40,
      }),
      columnHelper.accessor('title', {
        header: 'Title',
        cell: (info) => (
          <div className="flex items-center gap-2">
            <Link
              to={`/tasks/${info.row.original.id}`}
              className="font-medium text-primary-600 hover:text-primary-700 hover:underline"
            >
              {info.getValue()}
            </Link>
            {info.row.original.visibility === 'global' && (
              <span className="rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-800">
                Global
              </span>
            )}
          </div>
        ),
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (info) => (
          <span className={clsx('badge', statusBadge[info.getValue()])}>
            {info.getValue().replace('_', ' ')}
          </span>
        ),
      }),
      columnHelper.accessor('priority', {
        header: 'Priority',
        cell: (info) => (
          <span className={clsx('text-sm font-medium capitalize', priorityClass[info.getValue()])}>
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor('assigneeId', {
        header: 'Assignee',
        cell: (info) => <span className="text-sm text-slate-600">{info.getValue() || '—'}</span>,
      }),
      columnHelper.accessor('dueDate', {
        header: 'Due date',
        cell: (info) => {
          const date = info.getValue();
          if (!date) return <span className="text-sm text-slate-400">—</span>;
          const isOverdue = new Date(date) < new Date();
          return (
            <span
              className={clsx('text-sm', isOverdue ? 'text-red-600 font-medium' : 'text-slate-600')}
            >
              {new Date(date).toLocaleDateString()}
            </span>
          );
        },
      }),
      columnHelper.accessor('estimatedHours', {
        header: 'Est.',
        cell: (info) => (
          <span className="text-sm text-slate-600">
            {info.getValue() != null ? `${info.getValue()}h` : '—'}
          </span>
        ),
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: tasks,
    columns,
    state: {
      sorting,
      columnFilters,
      rowSelection,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableRowSelection: true,
  });

  const rows = table.getRowModel().rows;

  if (isLoading) {
    return <LoadingSpinner className="py-12" size="lg" />;
  }

  if (tasks.length === 0) {
    return <EmptyState title="No tasks" description="No tasks match the current filters." />;
  }

  const selectedCount = Object.keys(rowSelection).length;

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex items-center gap-3">
        <input
          type="text"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Search tasks..."
          className="input max-w-xs"
        />
        {selectedCount > 0 && (
          <span className="text-sm text-slate-500">{selectedCount} selected</span>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={clsx(
                      'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500',
                      header.column.getCanSort() &&
                        'cursor-pointer select-none hover:text-slate-700',
                    )}
                    onClick={header.column.getToggleSortingHandler()}
                    style={{ width: header.getSize() }}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{
                        asc: <span className="text-primary-500">&#9650;</span>,
                        desc: <span className="text-primary-500">&#9660;</span>,
                      }[header.column.getIsSorted() as string] ?? null}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((row) => (
              <tr
                key={row.id}
                className={clsx(
                  'transition-colors hover:bg-slate-50',
                  row.getIsSelected() && 'bg-primary-50',
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="whitespace-nowrap px-4 py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-sm text-slate-400">
        Showing {rows.length} of {tasks.length} tasks
      </p>
    </div>
  );
}
