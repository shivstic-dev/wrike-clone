import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TenantProvider } from './contexts/TenantContext';
import DashboardLayout from './layouts/DashboardLayout';
import AuthLayout from './layouts/AuthLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import WorkspacePage from './pages/WorkspacePage';
import ProjectPage from './pages/ProjectPage';
import TaskDetailPage from './pages/TaskDetailPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import MyTasksPage from './pages/MyTasksPage';
import AdminPage from './pages/AdminPage';
import CalendarPage from './pages/CalendarPage';
import ReportsPage from './pages/ReportsPage';
import PortfolioPage from './pages/PortfolioPage';
import TimesheetsPage from './pages/TimesheetsPage';
import SearchPage from './pages/SearchPage';
import SchedulePage from './pages/SchedulePage';
import PublicFormPage from './pages/PublicFormPage';
import { LoadingSpinner } from './components/common/LoadingSpinner';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
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

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <TenantProvider>
          <AuthProvider>
            <Routes>
              {/* Auth routes */}
              <Route element={<AuthLayout />}>
                <Route path="/login" element={<LoginPage />} />
              </Route>

              {/* Protected routes */}
              <Route
                element={
                  <ProtectedRoute>
                    <DashboardLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/my-tasks" element={<MyTasksPage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/portfolio" element={<PortfolioPage />} />
                <Route path="/timesheets" element={<TimesheetsPage />} />
                <Route path="/schedule" element={<SchedulePage />} />
                <Route path="/workspaces/:workspaceId" element={<WorkspacePage />} />
                <Route path="/projects/:projectId" element={<ProjectPage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
              </Route>

              {/* Public routes (no auth required) */}
              <Route path="/forms/:formId" element={<PublicFormPage />} />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </AuthProvider>
        </TenantProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
