import { useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import { Button, Panel } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { AuthStage } from '../layouts/AuthLayout';

function resolvePasswordChangeError(error: unknown): string {
  if (error instanceof Object && 'response' in error) {
    const responseMessage = (error as { response?: { data?: { error?: { message?: unknown } } } })
      .response?.data?.error?.message;
    if (typeof responseMessage === 'string' && responseMessage.trim()) {
      return responseMessage;
    }
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return 'Password change failed. Check your temporary password and try again.';
}

export default function ChangePasswordPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (currentPassword === newPassword) {
      setError('New password must be different from current password');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.post('/auth/change-password', {
        currentPassword,
        newPassword,
      });
      await logout();
      toast.success('Password changed. Sign in with your new password.');
      navigate('/login', { replace: true });
    } catch (caughtError: unknown) {
      setError(resolvePasswordChangeError(caughtError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthStage>
      <div className="w-full">
        <Panel className="px-6 py-8 sm:px-8 sm:py-9" padding="none">
          <div className="mb-8">
            <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-lg bg-atlas-fieldNote">
              <svg
                aria-hidden="true"
                className="h-6 w-6 text-atlas-canopy"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                viewBox="0 0 24 24"
              >
                <path d="M7 10V8a5 5 0 0 1 10 0v2m-9 0h8a2 2 0 0 1 2 2v7H6v-7a2 2 0 0 1 2-2Zm4 4v2" />
              </svg>
            </div>
            <p className="font-atlasMono text-[0.6875rem] font-medium uppercase tracking-[0.16em] text-atlas-current">
              Required security step
            </p>
            <h1 className="mt-3 font-atlasDisplay text-2xl font-semibold leading-tight tracking-[-0.015em] text-atlas-canopy sm:text-3xl">
              Create your private password
            </h1>
            <p className="mt-3 text-sm leading-6 text-atlas-current">
              Your organization issued a temporary password. Replace it now with a password only you
              know before you enter the workspace.
            </p>
          </div>

          {error && (
            <div
              className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              role="alert"
            >
              {error}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label
                htmlFor="currentPassword"
                className="mb-1.5 block text-sm font-semibold text-atlas-ink"
              >
                Temporary password
              </label>
              <input
                autoComplete="current-password"
                autoFocus
                className="block min-h-11 w-full rounded-lg border-atlas-mist bg-white px-3 text-sm text-atlas-ink focus:border-atlas-current focus:ring-atlas-current"
                id="currentPassword"
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
                type="password"
                value={currentPassword}
              />
            </div>

            <div>
              <label
                htmlFor="newPassword"
                className="mb-1.5 block text-sm font-semibold text-atlas-ink"
              >
                New private password
              </label>
              <input
                aria-describedby="new-password-requirements"
                autoComplete="new-password"
                className="block min-h-11 w-full rounded-lg border-atlas-mist bg-white px-3 text-sm text-atlas-ink placeholder:text-atlas-current/60 focus:border-atlas-current focus:ring-atlas-current"
                id="newPassword"
                minLength={8}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="At least 8 characters"
                required
                type="password"
                value={newPassword}
              />
              <p id="new-password-requirements" className="mt-1.5 text-xs text-atlas-current">
                Use at least 8 characters and do not reuse your temporary password.
              </p>
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="mb-1.5 block text-sm font-semibold text-atlas-ink"
              >
                Confirm private password
              </label>
              <input
                autoComplete="new-password"
                className="block min-h-11 w-full rounded-lg border-atlas-mist bg-white px-3 text-sm text-atlas-ink focus:border-atlas-current focus:ring-atlas-current"
                id="confirmPassword"
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                type="password"
                value={confirmPassword}
              />
            </div>

            <Button className="w-full" disabled={isSubmitting} size="lg" type="submit">
              {isSubmitting ? 'Creating password...' : 'Create private password'}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <Button onClick={logout} variant="ghost">
              Sign out instead
            </Button>
          </div>
        </Panel>
      </div>
    </AuthStage>
  );
}
