import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App, { ErrorBoundary } from './App';
import reportWebVitals from './reportWebVitals';

// Error monitoring (Sentry). Dynamically imported ONLY when a DSN is configured,
// so it adds zero bundle weight when unused. Set REACT_APP_SENTRY_DSN at build
// time (GitHub Actions env or .env) to turn it on. No DSN = no-op.
if (process.env.REACT_APP_SENTRY_DSN) {
  import('@sentry/react').then((Sentry) => {
    Sentry.init({
      dsn: process.env.REACT_APP_SENTRY_DSN,
      environment: process.env.NODE_ENV,
      // Conservative sampling — capture errors fully, trace a fraction.
      tracesSampleRate: 0.1,
      // Don't send default PII (IP, etc.). This is a finance app.
      sendDefaultPii: false,
    });
  }).catch(() => { /* monitoring is best-effort; never break the app over it */ });
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
