import { useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Button, Panel } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';

export function resolveLoginTenantSlug(
  enteredSlug: string,
  savedTenantSlug: string,
): string | undefined {
  return enteredSlug.trim() || savedTenantSlug.trim() || undefined;
}

function resolveAuthError(error: unknown, fallback: string): string {
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
  return fallback;
}

export default function LoginPage() {
  const { login } = useAuth();
  const { tenantSlug, setTenantSlug } = useTenant();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [slug, setSlug] = useState(tenantSlug);
  const [showSlugField, setShowSlugField] = useState(!tenantSlug);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      const message = 'Enter your email address and password to continue.';
      setError(message);
      toast.error(message);
      return;
    }

    setIsSubmitting(true);
    try {
      const finalSlug = resolveLoginTenantSlug(slug, tenantSlug);
      await login({
        ...(finalSlug ? { tenantSlug: finalSlug } : {}),
        email: email.trim(),
        password,
      });
      if (finalSlug) setTenantSlug(finalSlug);
    } catch (caughtError: unknown) {
      const message = resolveAuthError(
        caughtError,
        'Sign-in failed. Check your email, password, and organization workspace.',
      );
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full">
      <Panel className="px-6 py-8 sm:px-8 sm:py-9" padding="none">
        <div className="mb-8">
          <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-lg bg-atlas-canopy">
            <svg
              aria-hidden="true"
              className="h-6 w-6 text-atlas-fieldNote"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              viewBox="0 0 24 24"
            >
              <path d="M4 17 9 7l5 7 3-5 3 8H4Z" />
              <path d="M7 17h10" />
            </svg>
          </div>
          <p className="font-atlasMono text-[0.6875rem] font-medium uppercase tracking-[0.16em] text-atlas-current">
            OpenWork Hub
          </p>
          <h1 className="mt-3 font-atlasDisplay text-2xl font-semibold leading-tight tracking-[-0.015em] text-atlas-canopy sm:text-3xl">
            Sign in to your organization workspace
          </h1>
          <p className="mt-3 text-sm leading-6 text-atlas-current">
            Use the account details provided by your organization.
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
          {showSlugField && (
            <div>
              <label htmlFor="slug" className="mb-1.5 block text-sm font-semibold text-atlas-ink">
                Organization workspace
              </label>
              <input
                autoComplete="organization"
                autoFocus
                className="block min-h-11 w-full rounded-lg border-atlas-mist bg-white px-3 text-sm text-atlas-ink placeholder:text-atlas-current/60 focus:border-atlas-current focus:ring-atlas-current"
                id="slug"
                onChange={(event) => setSlug(event.target.value)}
                placeholder="my-company"
                type="text"
                value={slug}
              />
            </div>
          )}

          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-atlas-ink">
              Email address
            </label>
            <input
              autoComplete="email"
              autoFocus={!showSlugField}
              className="block min-h-11 w-full rounded-lg border-atlas-mist bg-white px-3 text-sm text-atlas-ink placeholder:text-atlas-current/60 focus:border-atlas-current focus:ring-atlas-current"
              id="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              required
              type="email"
              value={email}
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-atlas-ink">
              Password
            </label>
            <input
              autoComplete="current-password"
              className="block min-h-11 w-full rounded-lg border-atlas-mist bg-white px-3 text-sm text-atlas-ink placeholder:text-atlas-current/60 focus:border-atlas-current focus:ring-atlas-current"
              id="password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              required
              type="password"
              value={password}
            />
          </div>

          <Button className="w-full" disabled={isSubmitting} size="lg" type="submit">
            {isSubmitting ? (
              <span className="flex items-center gap-2" role="status">
                <span
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent motion-reduce:animate-none"
                />
                Signing in...
              </span>
            ) : (
              'Sign in'
            )}
          </Button>

          {!showSlugField && (
            <button
              className="min-h-10 w-full rounded-lg text-center text-xs font-semibold text-atlas-current hover:bg-atlas-paper hover:text-atlas-canopy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-atlas-current"
              onClick={() => setShowSlugField(true)}
              type="button"
            >
              Use a different organization workspace
            </button>
          )}
        </form>
      </Panel>
    </div>
  );
}
