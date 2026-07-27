import { PortfolioView } from '../components/Portfolio/PortfolioView';

export default function PortfolioPage() {
  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Portfolio</h1>
        <p className="mt-1 text-sm text-slate-500">Aggregated view of all workspaces, projects, and budgets.</p>
      </div>
      <PortfolioView />
    </div>
  );
}
