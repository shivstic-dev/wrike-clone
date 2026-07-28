import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartFrame } from './ChartFrame';

export interface DistributionChartProps {
  title: string;
  description: string;
  generatedAt: string;
  values: Record<string, number>;
}

function displayLabel(value: string): string {
  const words = value.replace(/[_-]+/g, ' ').trim();
  if (!words) return 'Unknown';
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

export function DistributionChart({
  description,
  generatedAt,
  title,
  values,
}: DistributionChartProps) {
  const data = Object.entries(values).map(([key, value]) => ({
    key,
    label: displayLabel(key),
    value,
  }));
  const summary =
    data.length > 0
      ? data.map((item) => `${item.label} ${item.value}`).join('; ') + '.'
      : 'No exact distribution values are available.';

  const fallback =
    data.length > 0 ? (
      <table className="w-full min-w-[20rem] border-collapse text-left text-sm">
        <caption className="sr-only">{title} exact values</caption>
        <thead>
          <tr className="border-b border-atlas-mist font-atlasMono text-xs uppercase tracking-[0.08em] text-atlas-current">
            <th scope="col" className="px-2 py-2 font-medium">
              Group
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Tasks
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.key} className="border-b border-atlas-mist/70 last:border-0">
              <th scope="row" className="px-2 py-2 font-medium text-atlas-ink">
                {item.label}
              </th>
              <td className="px-2 py-2 text-right font-atlasMono text-atlas-ink">{item.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ) : (
      <p className="text-sm text-slate-600">No exact values are available.</p>
    );

  return (
    <ChartFrame
      title={title}
      description={description}
      generatedAt={generatedAt}
      summary={summary}
      emptyMessage={
        data.length === 0 ? 'No distribution data is available for this scope.' : undefined
      }
      fallback={fallback}
    >
      <div className="min-w-0">
        <div className="h-56 w-full min-w-0 sm:h-60">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 4, right: 12, bottom: 4, left: 8 }}
            >
              <CartesianGrid stroke="#DDE5E0" strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                allowDecimals={false}
                stroke="#65736C"
                tick={{ fill: '#65736C', fontSize: 11 }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={88}
                stroke="#65736C"
                tick={{ fill: '#181C1A', fontSize: 11 }}
                tickLine={false}
              />
              <Tooltip
                isAnimationActive={false}
                contentStyle={{ borderColor: '#DDE5E0', borderRadius: 12, color: '#181C1A' }}
              />
              <Bar
                className="dashboard-series-distribution"
                dataKey="value"
                name="Tasks"
                fill="#147A50"
                radius={[0, 6, 6, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="dashboard-series-distribution mt-2 font-atlasMono text-xs text-atlas-current">
          Bar length represents task count; labels and exact values are available below.
        </p>
      </div>
    </ChartFrame>
  );
}

export default DistributionChart;
