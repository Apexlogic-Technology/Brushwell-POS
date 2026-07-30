import React, { Component, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[React ErrorBoundary]:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '2rem 1.5rem',
          maxWidth: '480px',
          margin: '2rem auto',
          background: '#1e293b',
          color: '#f8fafc',
          borderRadius: '16px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          textAlign: 'center',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
        }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f43f5e', marginBottom: '0.5rem' }}>
            Application Error
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '1rem' }}>
            An unexpected error occurred while starting the app.
          </p>
          <div style={{
            background: '#0f172a',
            padding: '0.75rem',
            borderRadius: '8px',
            fontSize: '0.75rem',
            fontFamily: 'monospace',
            textAlign: 'left',
            color: '#fbbf24',
            overflowX: 'auto',
            marginBottom: '1rem'
          }}>
            {this.state.error?.toString() || 'Unknown error'}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              padding: '0.6rem 1.25rem',
              borderRadius: '8px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Global window error listener for unhandled errors
window.addEventListener('error', (e) => {
  console.error('[Global Error]:', e.error || e.message);
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
