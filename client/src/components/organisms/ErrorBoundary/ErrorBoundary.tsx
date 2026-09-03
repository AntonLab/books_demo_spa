import { Component } from 'react';
import type { ReactNode } from 'react';
import { Alert, Button } from 'antd';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// The one class component in the client: React still exposes no hook
// equivalent of getDerivedStateFromError. See CLAUDE.md, "Page loading and
// errors", for why this is the documented exception rather than a new
// dependency.
//
// There is no componentDidCatch: React already logs an uncaught render error
// to the console itself, and the client has no logger to forward it to.
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  render(): ReactNode {
    const { error } = this.state;

    if (!error) {
      return this.props.children;
    }

    // App.tsx keys this boundary by pathname, so navigating anywhere else
    // remounts it and clears the error. This button covers staying put.
    return (
      <Alert
        type="error"
        showIcon
        title="Something went wrong on this page"
        description={error.message}
        action={
          <Button size="small" onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
        }
      />
    );
  }
}
