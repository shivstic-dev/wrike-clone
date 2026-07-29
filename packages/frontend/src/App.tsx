import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TenantProvider } from './contexts/TenantContext';
import AppShell from './layouts/AppShell';
import AuthLayout from './layouts/AuthLayout';
import { LoadingSpinner } from './components/common/LoadingSpinner';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const WorkspacePage = lazy(() => import('./pages/WorkspacePage'));
const ProjectPage = lazy(() => import('./pages/ProjectPage'));
const TaskDetailPage = lazy(() => import('./pages/TaskDetailPage'));
const ChangePasswordPage = lazy(() => import('./pages/ChangePasswordPage'));
const MyTasksPage = lazy(() => import('./pages/MyTasksPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const PortfolioPage = lazy(() => import('./pages/PortfolioPage'));
const TimesheetsPage = lazy(() => import('./pages/TimesheetsPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, mustChangePassword } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Phase 5: Force password change flow
  if (mustChangePassword) {
    return <ChangePasswordPage />;
  }

  return <>{children}</>;
}

function RouteLoadingFallback() {
  return (
    <div className="flex min-h-64 items-center justify-center">
      <LoadingSpinner size="lg" />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <TenantProvider>
          <AuthProvider>
            <Suspense fallback={<RouteLoadingFallback />}>
              <Routes>
                {/* Auth routes */}
                <Route element={<AuthLayout />}>
                  <Route path="/login" element={<LoginPage />} />
                </Route>

                {/* Protected routes */}
                <Route
                  element={
                    <ProtectedRoute>
                      <AppShell />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/my-tasks" element={<MyTasksPage />} />
                  <Route path="/admin" element={<AdminPage />} />
                  <Route path="/reports" element={<ReportsPage />} />
                  <Route path="/search" element={<SearchPage />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/portfolio" element={<PortfolioPage />} />
                  <Route path="/timesheets" element={<TimesheetsPage />} />
                  <Route path="/workspaces/:workspaceId" element={<WorkspacePage />} />
                  <Route path="/projects/:projectId" element={<ProjectPage />} />
                  <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
                </Route>

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </Suspense>
          </AuthProvider>
        </TenantProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
