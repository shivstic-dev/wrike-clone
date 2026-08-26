import { TimesheetPanel } from '../components/Timesheet/TimesheetPanel';

export default function TimesheetsPage() {
  return (
    <div className="mx-auto max-w-[96rem] p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Timesheets</h1>
        <p className="mt-1 text-sm text-slate-500">Log and track time spent on tasks.</p>
      </div>
      <TimesheetPanel />
    </div>
  );
}
