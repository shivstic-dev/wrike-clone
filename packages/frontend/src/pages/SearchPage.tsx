/**
 * Search Results Page.
 * Shows full search results with pagination and advanced filters
 * (project, status, assignee, type).
 */
import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/client';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorDisplay } from '../components/common/ErrorDisplay';
import { clsx } from 'clsx';

interface SearchResult {
  id: string;
  type: 'task' | 'project';
  title: string;
  description: string | null;
  url: string;
  metadata: Record<string, unknown>;
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
  page: number;
  perPage: number;
}

const TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'projects', label: 'Projects' },
];

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const query = searchParams.get('q') || '';
  const type = searchParams.get('type') || 'all';
  const projectId = searchParams.get('projectId') || '';
  const page = parseInt(searchParams.get('page') || '1', 10);

  const [localQuery, setLocalQuery] = useState(query);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['search', query, type, projectId, page],
    queryFn: async () => {
      if (!query.trim()) return null;
      const params = new URLSearchParams();
      params.set('q', query.trim());
      params.set('type', type);
      params.set('page', String(page));
      params.set('perPage', '20');
      if (projectId) params.set('projectId', projectId);

      const { data } = await apiClient.get<SearchResponse>(`/search?${params.toString()}`);
      return data;
    },
    enabled: query.trim().length >= 2,
    staleTime: 10000,
  });

  const results = data?.results || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value && value !== 'all') {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.set('page', '1');
    setSearchParams(params);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (localQuery.trim()) params.set('q', localQuery.trim());
    params.set('page', '1');
    setSearchParams(params);
  };

  return (
    <div className="mx-auto max-w-5xl p-6">
      {/* Search header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Search</h1>

        {/* Search form */}
        <form onSubmit={handleSearch} className="mt-4 flex gap-3">
          <div className="relative flex-1">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
            <input
              type="text"
              value={localQuery}
              onChange={(e) => setLocalQuery(e.target.value)}
              placeholder="Search tasks, projects..."
              className="input pl-10 text-base"
              autoFocus
            />
          </div>
          <button type="submit" className="btn-primary">
            Search
          </button>
        </form>
      </div>

      {/* Filters */}
      {query.trim().length >= 2 && (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-slate-500">Type:</span>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => updateFilter('type', opt.value)}
                className={clsx(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  type === opt.value
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <span className="ml-4 text-sm text-slate-400">
            {total} result{total !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Results */}
      {error ? (
        <ErrorDisplay message="Search failed" onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingSpinner className="mt-12" size="lg" />
      ) : !query.trim() ? (
        <EmptyState
          title="Search across all tasks and projects"
          description="Enter at least 2 characters to start searching."
        />
      ) : results.length === 0 ? (
        <EmptyState
          title="No results found"
          description={`No results for "${query}". Try different keywords or filters.`}
        />
      ) : (
        <>
          {/* Results list */}
          <div className="space-y-2">
            {results.map((result) => (
              <Link
                key={`${result.type}-${result.id}`}
                to={result.url}
                className="card flex items-start gap-4 p-4 transition-shadow hover:shadow-md"
              >
                <span
                  className={clsx(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white',
                    result.type === 'task' ? 'bg-blue-500' : 'bg-amber-500',
                  )}
                >
                  {result.type === 'task' ? 'T' : 'P'}
                </span>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-primary-600 hover:text-primary-700">
                    {result.title}
                  </h3>
                  {result.description && (
                    <p className="mt-1 text-xs text-slate-500 line-clamp-2">{result.description}</p>
                  )}
                  <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
                    <span className="font-medium uppercase tracking-wider text-slate-500">
                      {result.type}
                    </span>
                    {typeof result.metadata?.status === 'string' && (
                      <span className="capitalize">
                        {result.metadata.status.replace(/_/g, ' ')}
                      </span>
                    )}
                    {typeof result.metadata?.priority === 'string' &&
                      result.metadata.priority !== 'none' && (
                        <span>{result.metadata.priority}</span>
                      )}
                  </div>
                </div>
                <svg
                  className="mt-1 h-5 w-5 shrink-0 text-slate-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.25 4.5l7.5 7.5-7.5 7.5"
                  />
                </svg>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                onClick={() => updateFilter('page', String(page - 1))}
                disabled={page <= 1}
                className="btn-secondary btn-sm"
              >
                Previous
              </button>
              <span className="text-sm text-slate-500">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => updateFilter('page', String(page + 1))}
                disabled={page >= totalPages}
                className="btn-secondary btn-sm"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
