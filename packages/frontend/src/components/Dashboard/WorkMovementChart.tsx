import type { DashboardOverview } from '@wrike-clone/shared';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartFrame } from './ChartFrame';

export interface WorkMovementChartProps {
  generatedAt: string;
  daily: DashboardOverview['daily'];
}

function formatDashboardDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}

export function WorkMovementChart({ daily, generatedAt }: WorkMovementChartProps) {
  const totals = daily.reduce(
    (sum, point) => ({
      created: sum.created + point.created,
      completed: sum.completed + point.completed,
    }),
    { created: 0, completed: 0 },
  );
  const dayLabel = `${daily.length} ${daily.length === 1 ? 'day' : 'days'}`;
  const summary =
    daily.length > 0
      ? `${dayLabel}: Created ${totals.created}; Completed ${totals.completed}.`
      : 'No daily movement values are available.';

  const fallback =
    daily.length > 0 ? (
      <table className="w-full min-w-[24rem] border-collapse text-left text-sm">
        <caption className="sr-only">Exact daily created and completed task counts</caption>
        <thead>
          <tr className="border-b border-atlas-mist font-atlasMono text-xs uppercase tracking-[0.08em] text-atlas-current">
            <th scope="col" className="px-2 py-2 font-medium">
              Date
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Created
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Completed
            </th>
          </tr>
        </thead>
        <tbody>
          {daily.map((point) => (
            <tr key={point.date} className="border-b border-atlas-mist/70 last:border-0">
              <th scope="row" className="px-2 py-2 font-medium text-atlas-ink">
                <time dateTime={point.date}>{formatDashboardDate(point.date)}</time>
              </th>
              <td className="px-2 py-2 text-right font-atlasMono text-atlas-ink">
                {point.created}
              </td>
              <td className="px-2 py-2 text-right font-atlasMono text-atlas-ink">
                {point.completed}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    ) : (
      <p className="text-sm text-slate-600">No daily values are available.</p>
    );

  return (
    <ChartFrame
      title="30-day work movement"
      description="Daily tasks created and completed during the reporting window."
      generatedAt={generatedAt}
      summary={summary}
      emptyMessage={
        daily.length === 0
          ? 'No work movement was recorded for this 30-day period.'
          : undefined
      }
      fallback={fallback}
    >
      <div className="min-w-0">
        <div className="h-64 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={daily} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
              <CartesianGrid stroke="#DCE9E6" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDashboardDate}
                stroke="#25766F"
                tick={{ fill: '#25766F', fontSize: 11 }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                stroke="#25766F"
                tick={{ fill: '#25766F', fontSize: 11 }}
                tickLine={false}
              />
              <Tooltip
                isAnimationActive={false}
                contentStyle={{ borderColor: '#DCE9E6', borderRadius: 8, color: '#183432' }}
                labelFormatter={(label) => formatDashboardDate(String(label))}
              />
              <Legend />
              <Line
                className="dashboard-series-created"
                type="monotone"
                dataKey="created"
                name="Created"
                stroke="#25766F"
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                className="dashboard-series-completed"
                type="monotone"
                dataKey="completed"
                name="Completed"
                stroke="#123C3A"
                strokeDasharray="6 4"
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-atlasMono text-xs text-atlas-current">
          <span className="dashboard-series-created">Created — solid line</span>
          <span className="dashboard-series-completed">Completed – dashed line</span>
        </div>
      </div>
    </ChartFrame>
  );
}

export default WorkMovementChart;
