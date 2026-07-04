import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logError } from '../lib/diagnostics';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logError(error.message, info.componentStack ?? error.stack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="max-w-md mx-auto p-6 text-center space-y-3">
          <p className="text-2xl">🐕‍🦺💥</p>
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-gray-500">{this.state.error.message}</p>
          <a
            href={`${import.meta.env.BASE_URL}diagnostics`}
            className="text-sm text-sky-500 hover:underline"
          >
            View diagnostics
          </a>
        </div>
      );
    }
    return this.props.children;
  }
}
