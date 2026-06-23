// @vitest-environment jsdom
//
// R1a integration · the ErrorBoundary's default fallback is a real user-facing
// screen (not the bare role="alert" stub asserted in ErrorBoundary.test.tsx): it
// renders the title, a reassurance line, the thrown error's message under a
// <details>, and a Retry that actually recovers a now-healthy subtree. This guards
// the wiring the app relies on (root + canvas + match-detail panel boundaries)
// without booting React Flow.
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function Bomb({ crash }: { crash: boolean }): ReactNode {
  if (crash) throw new Error('canvas datum was malformed');
  return <div data-testid="canvas">canvas mounted</div>;
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  cleanup();
});

describe('ErrorBoundary · default fallback (R1a integration)', () => {
  it('shows the title, the thrown message detail, and a Retry button — not a blank screen', () => {
    render(
      <ErrorBoundary title="The roadmap couldn’t be displayed">
        <Bomb crash />
      </ErrorBoundary>,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('The roadmap couldn’t be displayed');
    // The raw error message is surfaced (in the technical-detail disclosure).
    expect(alert).toHaveTextContent('canvas datum was malformed');
    // A recovery affordance exists.
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('recovers the subtree when Retry is clicked after the condition is fixed', async () => {
    const user = userEvent.setup();

    function Harness(): ReactNode {
      const [crash, setCrash] = useState(true);
      return (
        <div>
          <button onClick={() => setCrash(false)}>repair</button>
          <ErrorBoundary>
            <Bomb crash={crash} />
          </ErrorBoundary>
        </div>
      );
    }

    render(<Harness />);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /repair/i }));
    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(screen.getByTestId('canvas')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
