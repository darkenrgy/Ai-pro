import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    console.error('Unhandled render error:', error);
  }

  private handleReset = (): void => {
    localStorage.removeItem('ai-pro-auth');
    localStorage.removeItem('user');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('rememberMe');
    window.location.assign('/login');
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
        <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/5 p-8 shadow-glow backdrop-blur-xl">
          <h2 className="mb-3 text-2xl font-semibold text-white">App recovered from an error</h2>
          <p className="mb-6 leading-6 text-slate-300">
            A runtime error occurred while rendering this page. Resetting local session data usually resolves this.
          </p>
          <button
            onClick={this.handleReset}
            className="inline-flex items-center rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
          >
            Reset and open login
          </button>
        </div>
      </div>
    );
  }
}