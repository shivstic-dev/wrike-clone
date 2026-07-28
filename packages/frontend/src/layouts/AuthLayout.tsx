import type { ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const AUTH_PREVIEW_METRICS = [
  ['Active work', '24'],
  ['Completed', '18'],
  ['Needs review', '3'],
] as const;

const AUTH_PREVIEW_BARS = [48, 72, 58, 86, 64, 76, 52] as const;

function WorkboardPreview() {
  return (
    <div
      aria-hidden="true"
      className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.07] p-5 shadow-[0_28px_70px_rgba(3,24,16,0.28)] backdrop-blur-sm"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[0.625rem] font-semibold uppercase tracking-[0.15em] text-emerald-100/65">
            Live workspace
          </p>
          <p className="mt-1 font-atlasDisplay text-base font-semibold text-white">Team overview</p>
        </div>
        <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[0.625rem] font-medium text-emerald-50">
          Updated now
        </span>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2.5">
        {AUTH_PREVIEW_METRICS.map(([label, value], index) => (
          <div
            className={
              index === 0
                ? 'rounded-xl bg-white px-3 py-3 text-atlas-canopy'
                : 'rounded-xl border border-white/10 bg-white/[0.06] px-3 py-3 text-white'
            }
            key={label}
          >
            <p className="text-[0.625rem] font-medium opacity-65">{label}</p>
            <p className="mt-1 font-atlasDisplay text-2xl font-semibold tracking-[-0.04em]">
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.06] p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-white">Work completed</p>
          <p className="text-[0.625rem] text-emerald-100/65">Last 7 days</p>
        </div>
        <div className="mt-4 flex h-20 items-end gap-2">
          {AUTH_PREVIEW_BARS.map((height, index) => (
            <span
              className={
                index === 3
                  ? 'flex-1 rounded-t-md bg-atlas-fieldNote'
                  : 'flex-1 rounded-t-md bg-white/25'
              }
              key={height}
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function AtlasBriefingPanel() {
  return (
    <aside className="relative hidden min-h-screen overflow-hidden bg-[#082d20] px-12 py-12 text-white lg:flex lg:flex-col lg:justify-between">
      <div
        aria-hidden="true"
        className="absolute -right-40 -top-36 h-[34rem] w-[34rem] rounded-full border border-white/[0.07]"
      />
      <div
        aria-hidden="true"
        className="absolute -right-24 -top-20 h-[27rem] w-[27rem] rounded-full border border-white/[0.07]"
      />

      <div className="relative flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/15 bg-white/10">
          <svg
            aria-hidden="true"
            className="h-5 w-5 text-atlas-fieldNote"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path d="M5 12.5 9.2 17 19 7" />
          </svg>
        </span>
        <p className="font-atlasDisplay text-xl font-semibold">OpenWork Hub</p>
      </div>

      <div className="relative max-w-xl">
        <h2 className="max-w-lg font-atlasDisplay text-4xl font-semibold leading-[1.08] tracking-[-0.045em] text-white xl:text-5xl">
          Clear priorities. Better teamwork.
        </h2>
        <p className="mt-4 max-w-lg text-base leading-7 text-emerald-50/65">
          Plan work, understand capacity, and move every project forward from one focused workspace.
        </p>
        <div className="mt-9">
          <WorkboardPreview />
        </div>
      </div>

      <p className="relative font-atlasMono text-[0.6875rem] font-medium tracking-[0.04em] text-emerald-50/55">
        Private organization workspace
      </p>
    </aside>
  );
}

export function AuthStage({ children }: { children: ReactNode }) {
  return (
    <div className="workboard-canvas min-h-screen text-atlas-ink">
      <div className="grid min-h-screen lg:grid-cols-[minmax(28rem,0.95fr)_minmax(32rem,1.05fr)]">
        <AtlasBriefingPanel />
        <section className="flex min-h-screen flex-col px-5 py-6 sm:px-10 lg:px-14 lg:py-10">
          <header className="mx-auto flex w-full max-w-md items-center justify-between lg:hidden">
            <p className="font-atlasDisplay text-lg font-semibold text-atlas-canopy">
              OpenWork Hub
            </p>
            <p className="font-atlasMono text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-atlas-current">
              Secure access
            </p>
          </header>

          <main className="mx-auto flex w-full max-w-md flex-1 items-center py-10">{children}</main>

          <footer className="mx-auto w-full max-w-md border-t border-atlas-mist pt-4 text-xs text-slate-500">
            &copy; {new Date().getFullYear()} OpenWork Hub. Private organization workspace.
          </footer>
        </section>
      </div>
    </div>
  );
}

export default function AuthLayout() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div
        aria-label="Loading workspace access"
        className="flex h-screen items-center justify-center bg-atlas-paper"
        role="status"
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-atlas-mist border-t-atlas-current motion-reduce:animate-none" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <AuthStage>
      <Outlet />
    </AuthStage>
  );
}
