import { useId, type ReactNode } from 'react';

export interface ChartFrameProps {
  title: string;
  description: string;
  generatedAt: string;
  summary: string;
  children?: ReactNode;
  fallback: ReactNode;
  emptyMessage?: string;
}

function generatedLabel(generatedAt: string): { dateTime?: string; label: string } {
  const date = new Date(generatedAt);
  if (Number.isNaN(date.getTime())) return { label: 'Generated time unavailable' };

  return {
    dateTime: generatedAt,
    label: `Generated ${new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date)}`,
  };
}

export function ChartFrame({
  children,
  description,
  emptyMessage,
  fallback,
  generatedAt,
  summary,
  title,
}: ChartFrameProps) {
  const titleId = useId();
  const descriptionId = useId();
  const summaryId = useId();
  const generated = generatedLabel(generatedAt);

  return (
    <figure
      className="workboard-card h-full min-w-0 rounded-2xl border border-atlas-mist bg-white p-4 sm:p-5"
      aria-labelledby={titleId}
      aria-describedby={`${descriptionId} ${summaryId}`}
    >
      <figcaption className="border-b border-atlas-mist pb-4">
        <span>
          <span
            id={titleId}
            className="block font-atlasDisplay text-lg font-semibold text-atlas-ink"
          >
            {title}
          </span>
          <span id={descriptionId} className="mt-1 block text-sm leading-5 text-slate-600">
            {description}
          </span>
        </span>
      </figcaption>

      <p id={summaryId} className="mt-4 text-sm font-semibold text-atlas-ink">
        {summary}
      </p>

      {emptyMessage ? (
        <p className="mt-4 rounded-xl border border-dashed border-atlas-mist bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">
          {emptyMessage}
        </p>
      ) : (
        <div aria-hidden="true" className="mt-4 min-w-0" data-chart-animation="disabled">
          {children}
        </div>
      )}

      <details className="mt-4 rounded-xl border border-atlas-mist bg-slate-50">
        <summary className="cursor-pointer rounded-lg px-4 py-3 text-sm font-semibold text-atlas-canopy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-atlas-current">
          View exact data
        </summary>
        <div className="overflow-x-auto border-t border-atlas-mist p-4">{fallback}</div>
      </details>
      <time
        dateTime={generated.dateTime}
        className="mt-3 block font-atlasMono text-[0.625rem] uppercase tracking-[0.08em] text-slate-400"
      >
        {generated.label}
      </time>
    </figure>
  );
}
