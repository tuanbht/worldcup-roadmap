import RoadmapCanvasLazy from '@/components/roadmap/RoadmapCanvas.lazy';
import { Legend } from '@/components/roadmap/Legend';
import { useTournamentQuery } from '@/features/roadmap/hooks/useTournamentQuery';

function AppShell() {
  const { data: tournament } = useTournamentQuery();
  const provider = tournament?.meta.provider ?? null;

  return (
    <main className="flex h-dvh flex-col overflow-hidden">
      <header className="border-edge relative z-10 flex flex-col gap-y-3 border-b px-6 py-5 sm:px-10">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <div>
            <p className="text-accent text-[0.72rem] font-semibold tracking-[0.22em] uppercase">
              FIFA World Cup 2026 · Canada · Mexico · USA
            </p>
            <h1 className="text-ink mt-1 text-[clamp(1.9rem,1.2rem+2.6vw,3.4rem)] font-extrabold tracking-tight">
              The Road to the Final
            </h1>
          </div>
          <p className="text-muted max-w-sm text-sm leading-relaxed">
            Group tables feeding a live knockout bracket. Drag, zoom, and trace every path to glory
            — press{' '}
            <kbd className="border-edge bg-surf-2 text-ink rounded border px-1.5 py-0.5 text-[0.7rem]">
              F
            </kbd>{' '}
            to fit, click any match for details.
          </p>
        </div>
        {/* Mobile legend band — only visible below sm; at sm+ the floating Panel in the canvas takes over */}
        <div className="sm:hidden" aria-label="Map legend">
          <Legend provider={provider} />
        </div>
      </header>

      <section aria-label="World Cup roadmap" className="relative min-h-0 flex-1">
        <RoadmapCanvasLazy />
      </section>
    </main>
  );
}

export default function App() {
  return <AppShell />;
}
