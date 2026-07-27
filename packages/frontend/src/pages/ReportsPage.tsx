import { ReportsPanel } from '../components/Reports/ReportsPanel';

export default function ReportsPage() {
  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Reports & Analytics</h1>
        <p className="mt-1 text-sm text-slate-500">
          Metrics, charts, and insights across all projects.
        </p>
      </div>
      <ReportsPanel />
    </div>
  );
}
