import React from 'react';
import ReactDOM from 'react-dom/client';
import { initSentry, Sentry } from './lib/sentry';
import App from './App';
import './styles/index.css';

// Initialize Sentry error monitoring before rendering
initSentry();

function ErrorFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-8">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-bold text-slate-900 mb-2">Something went wrong</h1>
        <p className="text-sm text-slate-500">
          An unexpected error occurred. The team has been notified.
        </p>
        <button onClick={() => window.location.reload()} className="mt-4 btn-primary">
          Reload page
        </button>
      </div>
    </div>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
        <App />
      </Sentry.ErrorBoundary>
    </React.StrictMode>,
  );
}

export default App;
