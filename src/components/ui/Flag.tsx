import { useState } from 'react';

interface FlagProps {
  code: string | null;
  url: string | null;
  size?: number;
  /**
   * `round` renders a circular roundel for the radial badges (+ a round monogram
   * fallback). Default `rect` is the existing rectangular chip — unchanged.
   */
  shape?: 'rect' | 'round';
}

const SHADOW = 'shadow-[0_0_0_1px_rgb(0_0_0/0.35)]';

/**
 * Team flag with a graceful fallback: if the remote image fails (or there's no
 * code yet for a TBD slot) we render a tinted monogram instead of a broken icon.
 *
 * `shape="round"` renders a circular `size×size` roundel (`object-cover`) and a
 * matching round monogram fallback, so a TBD/null-code slot on the radial outer
 * ring still reads as a roundel — not a rect chip inside a round layout [M2].
 */
export function Flag({ code, url, size = 22, shape = 'rect' }: FlagProps) {
  const [failed, setFailed] = useState(false);
  const round = shape === 'round';
  // Round roundels are square; the rect chip keeps its 0.7 aspect ratio.
  const style = { width: size, height: round ? size : Math.round(size * 0.7) };
  const radius = round ? 'rounded-full' : 'rounded-[3px]';

  if (!url || !code || failed) {
    return (
      <span
        aria-hidden="true"
        style={style}
        className={`bg-surf-3 text-muted inline-flex shrink-0 items-center justify-center ${radius} text-[8px] font-bold ${SHADOW}`}
      >
        {code ?? '··'}
      </span>
    );
  }

  return (
    <img
      src={url}
      alt=""
      aria-hidden="true"
      width={style.width}
      height={style.height}
      // Inline width/height so the round roundel stays a true square circle: the
      // HTML height attribute alone is overridden by the global `img { height: auto }`
      // reset, which would render a real (rectangular) flag at its natural aspect
      // inside `rounded-full` — i.e. an ellipse, not a circle. Scoped to `round` so
      // the rect chip (grid) keeps its current natural-aspect rendering unchanged.
      style={round ? style : undefined}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`bg-surf-3 inline-block shrink-0 ${radius} object-cover ${SHADOW}`}
    />
  );
}
