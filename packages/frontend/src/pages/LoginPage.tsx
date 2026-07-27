import { useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import toast from 'react-hot-toast';
export default function LoginPage() {
  const { login } = useAuth();
  const { tenantSlug, setTenantSlug } = useTenant();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [slug, setSlug] = useState(tenantSlug);
  const [showSlugField, setShowSlugField] = useState(!tenantSlug);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    // Slug is optional — if DEFAULT_TENANT_SLUG is set on the backend, it's resolved automatically
    if (!email.trim() || !password.trim()) {
      toast.error('Please fill in email and password');
      return;
    }

    setIsSubmitting(true);
    try {
      const finalSlug = showSlugField ? slug.trim() : undefined;
      if (finalSlug) setTenantSlug(finalSlug);
      await login({
        ...(finalSlug ? { tenantSlug: finalSlug } : {}),
        email: email.trim(),
        password,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Object && 'response' in err
          ? (err as { response: { data: { error: { message: string } } } }).response?.data?.error
              ?.message
          : 'Login failed. Please check your credentials.';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-sm">
      <div className="card px-6 py-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-600">
            <span className="text-xl font-bold text-white">WC</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Sign in to OpenWork Hub</h1>
          <p className="mt-1 text-sm text-slate-500">Enter your email to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tenant slug field — hidden by default when DEFAULT_TENANT_SLUG is set */}
          {showSlugField && (
            <div>
              <label htmlFor="slug" className="label">
                Tenant slug
              </label>
              <input
                id="slug"
                type="text"
                className="input"
                placeholder="my-company"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                autoFocus
              />
            </div>
          )}

          <div>
            <label htmlFor="email" className="label">
              Email address
            </label>
            <input
              id="email"
              type="email"
              className="input"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus={!showSlugField}
            />
          </div>

          <div>
            <label htmlFor="password" className="label">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="input"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Signing in...
              </span>
            ) : (
              'Sign in'
            )}
          </button>

          {!showSlugField && (
            <button
              type="button"
              onClick={() => setShowSlugField(true)}
              className="w-full text-center text-xs text-slate-400 hover:text-slate-600"
            >
              Need to use a different tenant slug?
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
