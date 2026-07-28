import type { ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function AtlasRouteMark() {
  return (
    <div aria-hidden="true" className="relative h-48 w-full max-w-md">
      <div className="sunny-bob absolute left-3 top-14 grid h-20 w-20 place-items-center rounded-[2rem] bg-atlas-fieldNote text-3xl text-atlas-ink shadow-[0_8px_0_rgba(73,61,125,0.16)]">
        ✓
      </div>
      <div className="absolute left-28 top-4 grid h-14 w-14 rotate-6 place-items-center rounded-full bg-atlas-sprout text-xl text-atlas-ink">
        +
      </div>
      <div className="absolute left-36 top-24 grid h-24 w-24 -rotate-6 place-items-center rounded-[2.4rem] bg-atlas-blush text-3xl text-atlas-ink shadow-[0_8px_0_rgba(73,61,125,0.12)]">
        ♥
      </div>
      <div className="absolute right-12 top-10 grid h-16 w-16 place-items-center rounded-full bg-atlas-sky text-2xl text-atlas-ink">
        ✦
      </div>
    </div>
  );
}

function AtlasBriefingPanel() {
  return (
    <aside className="relative hidden min-h-screen overflow-hidden bg-atlas-canopy px-12 py-14 text-white lg:flex lg:flex-col lg:justify-between">
      <div
        aria-hidden="true"
        className="absolute -right-24 -top-20 h-80 w-80 rounded-full bg-atlas-sky/15"
      />
      <div
        aria-hidden="true"
        className="absolute -right-5 top-12 h-56 w-56 rounded-full border-2 border-atlas-fieldNote/30"
      />
      <div className="relative">
        <p className="font-atlasMono text-xs font-bold uppercase tracking-[0.12em] text-atlas-fieldNote">
          Your happy work corner
        </p>
        <p className="mt-4 font-atlasDisplay text-2xl font-bold">OpenWork Hub</p>
      </div>

      <div className="relative max-w-lg">
        <AtlasRouteMark />
        <h2 className="max-w-md font-atlasDisplay text-4xl font-semibold leading-[1.08] tracking-[-0.025em] text-white xl:text-5xl">
          Big work feels lighter here.
        </h2>
        <p className="mt-5 max-w-md text-lg leading-7 text-atlas-mist">
          Plan together, celebrate progress, and always know the next helpful step.
        </p>
      </div>

      <p className="relative font-atlasMono text-[0.6875rem] font-bold tracking-[0.08em] text-atlas-mist/80">
        Private, calm, and made for your team
      </p>
    </aside>
  );
}

export function AuthStage({ children }: { children: ReactNode }) {
  return (
    <div className="sunny-canvas min-h-screen text-atlas-ink">
      <div className="grid min-h-screen lg:grid-cols-[minmax(24rem,0.9fr)_minmax(32rem,1.1fr)]">
        <AtlasBriefingPanel />
        <section className="flex min-h-screen flex-col px-5 py-6 sm:px-10 lg:px-14 lg:py-10">
          <header className="mx-auto flex w-full max-w-md items-center justify-between lg:hidden">
            <p className="font-atlasDisplay text-lg font-bold text-atlas-canopy">OpenWork Hub</p>
            <p className="font-atlasMono text-[0.625rem] font-medium uppercase tracking-[0.16em] text-atlas-current">
              Welcome back
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
