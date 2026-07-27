/**
 * PublicFormPage — public-facing request form submission page.
 * No authentication required. External stakeholders can submit requests.
 */
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import apiClient from '../api/client';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorDisplay } from '../components/common/ErrorDisplay';

interface FormField {
  name: string;
  type: string;
  required: boolean;
  options?: string[];
}

interface RequestForm {
  id: string;
  name: string;
  description: string | null;
  fields: FormField[];
}

export default function PublicFormPage() {
  const { formId } = useParams<{ formId: string }>();
  const [form, setForm] = useState<RequestForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!formId) return;
    const fetchForm = async () => {
      try {
        const { data } = await apiClient.get(`/public/forms/${formId}`);
        setForm(data);
        // Initialize empty values
        if (data.fields) {
          const initial: Record<string, string> = {};
          data.fields.forEach((f: FormField) => {
            initial[f.name] = '';
          });
          setValues(initial);
        }
      } catch (err: any) {
        setError(err.response?.data?.error?.message || 'Failed to load form');
      } finally {
        setLoading(false);
      }
    };
    fetchForm();
  }, [formId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formId || !form) return;
    setSubmitError(null);
    setSubmitting(true);

    try {
      const submissionValues: Record<string, unknown> = {};
      form.fields.forEach((f) => {
        submissionValues[f.name] = values[f.name] || '';
      });

      await apiClient.post(`/public/forms/${formId}/submit`, { values: submissionValues });
      setSubmitted(true);
    } catch (err: any) {
      setSubmitError(err.response?.data?.error?.message || 'Failed to submit form');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <ErrorDisplay message={error} />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg
              className="h-8 w-8 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h2 className="mb-2 text-xl font-bold text-slate-900">Submitted!</h2>
          <p className="text-sm text-slate-500">
            Your request has been received. Someone from the team will follow up.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-indigo-50 py-12 px-4">
      <div className="mx-auto max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary-600 shadow-lg">
            <svg
              className="h-7 w-7 text-white"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{form?.name || 'Request Form'}</h1>
          {form?.description && <p className="mt-2 text-sm text-slate-500">{form.description}</p>}
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl bg-white p-8 shadow-lg border border-slate-100"
        >
          <div className="space-y-5">
            {form?.fields?.map((field) => (
              <div key={field.name}>
                <label className="label mb-1.5 block text-sm font-medium text-slate-700">
                  {field.name.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                  {field.required && <span className="ml-1 text-red-400">*</span>}
                </label>

                {field.type === 'text' && field.options ? (
                  <select
                    className="input w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
                    value={values[field.name] || ''}
                    onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
                    required={field.required}
                  >
                    <option value="">-- Select --</option>
                    {field.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : field.type === 'textarea' ? (
                  <textarea
                    className="input w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all resize-none"
                    rows={3}
                    value={values[field.name] || ''}
                    onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
                    required={field.required}
                  />
                ) : (
                  <input
                    type={field.type === 'number' ? 'number' : 'text'}
                    className="input w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
                    placeholder={`Enter ${field.name.replace(/_/g, ' ')}`}
                    value={values[field.name] || ''}
                    onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
                    required={field.required}
                  />
                )}
              </div>
            ))}
          </div>

          {submitError && (
            <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {submitError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-6 w-full rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Submitting...
              </span>
            ) : (
              'Submit Request'
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-slate-400">
          Powered by OpenWork Hub · Your information will be shared with the team.
        </p>
      </div>
    </div>
  );
}
