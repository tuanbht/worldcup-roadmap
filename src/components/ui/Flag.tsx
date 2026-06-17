import { useState } from 'react';

interface FlagProps {
  code: string | null;
  url: string | null;
  size?: number;
}

const SHADOW = 'shadow-[0_0_0_1px_rgb(0_0_0/0.35)]';

/**
 * Team flag with a graceful fallback: if the remote image fails (or there's no
 * code yet for a TBD slot) we render a tinted monogram instead of a broken icon.
 */
export function Flag({ code, url, size = 22 }: FlagProps) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: Math.round(size * 0.7) };

  if (!url || !code || failed) {
    return (
      <span
        aria-hidden="true"
        style={style}
        className={`inline-flex shrink-0 items-center justify-center rounded-[3px] bg-surf-3 text-[8px] font-bold text-muted ${SHADOW}`}
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
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`inline-block shrink-0 rounded-[3px] bg-surf-3 object-cover ${SHADOW}`}
    />
  );
}
