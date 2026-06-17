import RoadmapCanvasLazy from '@/components/roadmap/RoadmapCanvas.lazy';

export default function App() {
  return (
    <main className="flex h-dvh flex-col overflow-hidden">
      <header className="relative z-10 flex flex-wrap items-end justify-between gap-x-8 gap-y-3 border-b border-edge px-6 py-5 sm:px-10">
        <div>
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-accent">
            FIFA World Cup 2026 · Canada · Mexico · USA
          </p>
          <h1 className="mt-1 text-[clamp(1.9rem,1.2rem+2.6vw,3.4rem)] font-extrabold tracking-tight text-ink">
            The Road to the Final
          </h1>
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-muted">
          Group tables feeding a live knockout bracket. Drag, zoom, and trace every path to glory —
          press <kbd className="rounded border border-edge bg-surf-2 px-1.5 py-0.5 text-[0.7rem] text-ink">F</kbd>{' '}
          to fit, click any match for details.
        </p>
      </header>

      <section aria-label="World Cup roadmap" className="relative min-h-0 flex-1">
        <RoadmapCanvasLazy />
      </section>
    </main>
  );
}
