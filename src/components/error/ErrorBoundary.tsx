import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react';
import { ErrorFallback } from './ErrorFallback';

export interface ErrorBoundaryProps {
  readonly children: ReactNode;
  /** Reset key — changing it (e.g. on Retry) clears the error and re-mounts. */
  readonly resetKey?: unknown;
  /** Custom fallback; defaults to <ErrorFallback>. Receives the error + a reset fn. */
  readonly fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Headline shown by the default fallback. */
  readonly title?: string;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
}

const DEFAULT_TITLE = 'This view ran into a problem';

/**
 * Reusable React error boundary (R1a). Converts any render-time throw in its
 * subtree into a user-facing fallback — never a blank page. Wraps the whole app
 * (root), the canvas, and the match-detail panel so an isolated render failure in
 * one region degrades gracefully without unmounting the rest.
 *
 * Recovery: the default `<ErrorFallback>` exposes a Retry that clears the error
 * and re-renders the subtree. The optional `resetKey` prop lets a parent that has
 * fixed the underlying condition recover on Retry — the subtree is re-attached
 * fresh when Retry clears the error and the now-healthy child renders.
 *
 * A class component is required here: `getDerivedStateFromError` /
 * `componentDidCatch` are the only render-error hooks React provides, and there is
 * no hooks equivalent.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface caught render errors in development only (no-console-in-prod rule);
    // React itself already logs them, so this stays scoped to dev observability.
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('[ErrorBoundary] caught a render error:', error, info.componentStack);
    }
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error === null) {
      // Keying the healthy subtree on `resetKey` lets a parent force a fresh
      // re-mount of the children by changing the key (no manual remount logic).
      return <Fragment key={String(this.props.resetKey)}>{this.props.children}</Fragment>;
    }

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <ErrorFallback title={this.props.title ?? DEFAULT_TITLE} error={error} onRetry={this.reset} />
    );
  }
}
