import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <div className="page">
          <div className="card empty-state">
            <AlertTriangle size={32} />
            <h1>This page needs a fresh start</h1>
            <p className="muted">
              An unexpected display error occurred. Your saved projects remain in your account.
            </p>
            <button className="button button-primary" onClick={() => location.reload()}>
              Reload the application
            </button>
            <a href="/tools">Return to calculators</a>
          </div>
        </div>
      );
    return this.props.children;
  }
}
