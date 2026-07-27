/**
 * Global Search Bar component.
 * Renders in the header bar and provides instant search across tasks and projects
 * using the /search endpoint. Displays results in a dropdown overlay.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../../api/client';
import { clsx } from 'clsx';

interface SearchResult {
  id: string;
  type: 'task' | 'project';
  title: string;
  description: string | null;
  url: string;
  metadata: Record<string, unknown>;
  score?: number;
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
  page: number;
  perPage: number;
}

export function SearchBar() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounced search
  const { data, isLoading } = useQuery({
    queryKey: ['global-search', query],
    queryFn: async () => {
      if (!query.trim()) return null;
      const { data } = await apiClient.get<SearchResponse>(
        `/search?q=${encodeURIComponent(query.trim())}&perPage=8`,
      );
      return data;
    },
    enabled: query.trim().length >= 2,
    staleTime: 5000,
  });

  const results = data?.results || [];

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && selectedIndex >= 0 && results[selectedIndex]) {
      e.preventDefault();
      navigate(results[selectedIndex].url);
      setQuery('');
      setIsOpen(false);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  }, [navigate, results, selectedIndex]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (result: SearchResult) => {
    navigate(result.url);
    setQuery('');
    setIsOpen(false);
  };

  return (
    <div className="relative flex-1 max-w-md mx-4">
      {/* Search input */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
          fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setSelectedIndex(-1);
          }}
          onFocus={() => query.trim().length >= 2 && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search tasks, projects..."
          className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-700 placeholder-slate-400 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 transition-colors"
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-primary-600" />
          </div>
        )}
      </div>

      {/* Results dropdown */}
      {isOpen && query.trim().length >= 2 && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-1 rounded-xl border border-slate-200 bg-white shadow-lg z-50 overflow-hidden"
        >
          {results.length === 0 && !isLoading && (
            <div className="px-4 py-8 text-center text-sm text-slate-400">
              No results for "{query}"
            </div>
          )}

          {results.length > 0 && (
            <ul className="max-h-80 overflow-y-auto divide-y divide-slate-100">
              {results.map((result, i) => (
                <li key={`${result.type}-${result.id}`}>
                  <button
                    onClick={() => handleSelect(result)}
                    onMouseEnter={() => setSelectedIndex(i)}
                    className={clsx(
                      'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
                      selectedIndex === i ? 'bg-primary-50' : 'hover:bg-slate-50',
                    )}
                  >
                    {/* Type icon */}
                    <span className={clsx(
                      'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-bold text-white',
                      result.type === 'task' ? 'bg-blue-500' : 'bg-amber-500',
                    )}>
                      {result.type === 'task' ? 'T' : 'P'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {result.title}
                      </p>
                      {result.description && (
                        <p className="mt-0.5 text-xs text-slate-500 line-clamp-1">
                          {result.description}
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-2">
                        <span className={clsx(
                          'text-[10px] font-medium uppercase tracking-wider',
                          result.type === 'task' ? 'text-blue-500' : 'text-amber-500',
                        )}>
                          {result.type}
                        </span>
                        {String(result.metadata?.status ?? '') && (
                          <span className="text-[10px] text-slate-400">
                            {String(result.metadata?.status ?? '').replace(/_/g, ' ')}
                          </span>
                        )}
                        {String(result.metadata?.priority ?? '') !== 'none' && (
                          <span className="text-[10px] text-slate-400">
                            {String(result.metadata?.priority ?? '')}
                          </span>
                        )}
                      </div>
                    </div>
                    <svg className="mt-1 h-4 w-4 shrink-0 text-slate-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {data && data.total > results.length && (
            <div className="border-t border-slate-100 px-4 py-2 text-center">
              <Link
                to={`/search?q=${encodeURIComponent(query)}`}
                className="text-xs font-medium text-primary-600 hover:text-primary-700"
                onClick={() => { setQuery(''); setIsOpen(false); }}
              >
                See all {data.total} results
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
