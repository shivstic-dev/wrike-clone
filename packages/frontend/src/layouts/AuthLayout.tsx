import type { ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function AtlasRouteMark() {
  return (
    <div aria-hidden="true" className="relative h-44 w-full max-w-md overflow-hidden">
      <div className="absolute left-5 top-20 h-px w-72 -rotate-12 bg-atlas-mist/40" />
      <div className="absolute left-28 top-16 h-px w-64 rotate-[22deg] bg-atlas-mist/30" />
      <div className="absolute left-44 top-24 h-px w-48 -rotate-[38deg] bg-atlas-fieldNote/60" />
      <div className="absolute left-8 top-[4.6rem] h-3 w-3 rounded-full border-2 border-atlas-fieldNote bg-atlas-canopy" />
      <div className="absolute left-[10.7rem] top-[5.55rem] h-4 w-4 rounded-full bg-atlas-fieldNote shadow-[0_0_0_7px_rgba(242,203,103,0.14)]" />
      <div className="absolute right-10 top-14 h-3 w-3 rounded-full border-2 border-atlas-mist bg-atlas-canopy" />
      <p className="absolute bottom-2 left-5 font-atlasMono text-[0.625rem] uppercase tracking-[0.18em] text-atlas-mist/70">
        One shared field of view
      </p>
    </div>
  );
}

function AtlasBriefingPanel() {
  return (
    <aside className="relative hidden min-h-screen overflow-hidden bg-atlas-canopy px-12 py-14 text-white lg:flex lg:flex-col lg:justify-between">
      <div
        aria-hidden="true"
        className="absolute -right-24 -top-20 h-80 w-80 rounded-full border border-atlas-mist/10"
      />
      <div
        aria-hidden="true"
        className="absolute -right-5 top-12 h-56 w-56 rounded-full border border-atlas-mist/10"
      />
      <div className="relative">
        <p className="font-atlasMono text-xs font-medium uppercase tracking-[0.2em] text-atlas-fieldNote">
          Operations Atlas
        </p>
        <p className="mt-4 font-atlasDisplay text-2xl font-bold">OpenWork Hub</p>
      </div>

      <div className="relative max-w-lg">
        <AtlasRouteMark />
        <h2 className="max-w-md font-atlasDisplay text-4xl font-semibold leading-[1.08] tracking-[-0.025em] text-white xl:text-5xl">
          Keep every handoff in view.
        </h2>
        <p className="mt-5 max-w-md text-lg leading-7 text-atlas-mist">
          Coordinate priorities, ownership, and progress across your organization from one
          dependable workspace.
        </p>
      </div>

      <p className="relative font-atlasMono text-[0.6875rem] uppercase tracking-[0.16em] text-atlas-mist/70">
        Private organization access
      </p>
    </aside>
  );
}

export function AuthStage({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-atlas-paper text-atlas-ink">
      <div className="grid min-h-screen lg:grid-cols-[minmax(24rem,0.9fr)_minmax(32rem,1.1fr)]">
        <AtlasBriefingPanel />
        <section className="flex min-h-screen flex-col px-5 py-6 sm:px-10 lg:px-14 lg:py-10">
          <header className="mx-auto flex w-full max-w-md items-center justify-between lg:hidden">
            <p className="font-atlasDisplay text-lg font-bold text-atlas-canopy">OpenWork Hub</p>
            <p className="font-atlasMono text-[0.625rem] font-medium uppercase tracking-[0.16em] text-atlas-current">
              Operations Atlas
            </p>
          </header>

          <main className="mx-auto flex w-full max-w-md flex-1 items-center py-10">
            {children}
          </main>

          <footer className="mx-auto w-full max-w-md border-t border-atlas-mist pt-4 text-xs text-atlas-current">
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
