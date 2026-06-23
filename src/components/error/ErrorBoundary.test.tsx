// @vitest-environment jsdom
//
// R1 · ErrorBoundary (AC 1–3). A reusable React error boundary that converts a
// render-time throw anywhere in its subtree into a user-facing fallback screen
// with a Retry action — never a blank page.
//
// These tests are RED until stage 4 replaces the `ErrorBoundary` stub with the
// real class component. The stub throws "not implemented" on render, so the
// behavioral assertions fail for the RIGHT reason (boundary not implemented),
// not on a missing import.
//
// React logs caught render errors to console.error; we scope a spy to keep test
// output clean (mirrors the project's console-filter precedent in
// useTournamentQuery.test.tsx).
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

const CRASH_MESSAGE = 'child render exploded';

/** A child that throws during render when `crash` is true. */
function Bomb({ crash }: { crash: boolean }): ReactNode {
  if (crash) throw new Error(CRASH_MESSAGE);
  return <div data-testid="recovered">all good</div>;
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // Swallow the expected React "error boundary caught" console noise so a
  // genuinely unexpected error would still be the only thing surfaced. We keep the
  // spy handle so the componentDidCatch-contract case can assert what was logged.
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  cleanup();
});

describe('ErrorBoundary', () => {
  it('renders children unchanged when no child throws', () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">hello</div>
      </ErrorBoundary>,
    );

    expect(screen.getByTestId('child')).toHaveTextContent('hello');
    // No fallback alert when nothing threw.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders a role="alert" fallback when a child throws during render', () => {
    render(
      <ErrorBoundary>
        <Bomb crash />
      </ErrorBoundary>,
    );

    // A user-facing fallback region, not a blank page.
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('shows the provided title in the default fallback', () => {
    render(
      <ErrorBoundary title="This panel hit a snag">
        <Bomb crash />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('This panel hit a snag');
  });

  it('default fallback exposes a Retry action that resets and re-renders the recovered child', async () => {
    const user = userEvent.setup();

    // Harness: a parent that flips the child from crashing to healthy. The Retry
    // button must reset the boundary so the now-healthy child renders.
    function Harness(): ReactNode {
      const [crash, setCrash] = useState(true);
      return (
        <div>
          <button onClick={() => setCrash(false)}>fix child</button>
          <ErrorBoundary resetKey={crash}>
            <Bomb crash={crash} />
          </ErrorBoundary>
        </div>
      );
    }

    render(<Harness />);

    // Initially the boundary is tripped.
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByTestId('recovered')).toBeNull();

    // Clear the underlying error condition, then Retry to reset the boundary.
    await user.click(screen.getByRole('button', { name: /fix child/i }));
    await user.click(screen.getByRole('button', { name: /retry|try again/i }));

    // The recovered subtree renders; the fallback is gone.
    expect(screen.getByTestId('recovered')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('uses a custom fallback render-prop when provided, receiving the thrown Error', () => {
    const fallback = vi.fn((error: Error) => (
      <div role="alert" data-testid="custom-fallback">
        custom: {error.message}
      </div>
    ));

    render(
      <ErrorBoundary fallback={fallback}>
        <Bomb crash />
      </ErrorBoundary>,
    );

    const custom = screen.getByTestId('custom-fallback');
    expect(custom).toHaveTextContent(`custom: ${CRASH_MESSAGE}`);
    // The render-prop received the EXACT thrown Error (identity + message), not
    // just any error — and a reset callback as the second argument.
    expect(fallback).toHaveBeenCalledWith(
      expect.objectContaining({ message: CRASH_MESSAGE }),
      expect.any(Function),
    );
    // The default fallback must NOT also render alongside the custom one.
    expect(screen.queryAllByRole('alert')).toHaveLength(1);
  });

  it('forwards the caught Error to componentDidCatch (dev observability contract)', () => {
    // AC: the boundary must surface the caught render error for dev observability
    // (componentDidCatch → console.error in DEV). We assert the boundary logged the
    // ACTUAL thrown Error, not merely that something was logged — this pins the
    // logger/componentDidCatch contract the implementer must honor.
    render(
      <ErrorBoundary>
        <Bomb crash />
      </ErrorBoundary>,
    );

    const loggedTheThrownError = consoleErrorSpy.mock.calls.some((args) =>
      args.some((arg) => arg instanceof Error && arg.message === CRASH_MESSAGE),
    );
    expect(loggedTheThrownError).toBe(true);
  });

  it('isolates a thrown inner boundary from the surrounding outer subtree (nested isolation)', () => {
    // AC 2: a throw caught by an INNER boundary must not unmount the OUTER
    // boundary's siblings — graceful degradation, not a cascading blank page.
    render(
      <ErrorBoundary title="Outer region">
        <div data-testid="sibling">still here</div>
        <ErrorBoundary title="Inner panel">
          <Bomb crash />
        </ErrorBoundary>
      </ErrorBoundary>,
    );

    // The sibling under the OUTER boundary stays mounted.
    expect(screen.getByTestId('sibling')).toHaveTextContent('still here');
    // Exactly one fallback (the inner one) surfaces; the outer boundary never trips.
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent('Inner panel');
    expect(screen.queryByText('Outer region')).toBeNull();
  });
});
