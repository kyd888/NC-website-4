import type { CSSProperties } from "react";

type Props = {
  image?: string;
  alt: string;
  /** Aspect ratio as CSS value, e.g. "1 / 1" or "4 / 5". */
  ratio?: string;
  /** Varies the placeholder tone per item when there's no image yet. */
  seed?: string | number;
  className?: string;
};

// Deterministic 0..1 from a string so placeholders differ per item but stay stable.
function hash(seed: string | number): number {
  const s = String(seed);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * Image tile used by every grid (music, shows, visuals, events).
 * Falls back to a dark, slightly varied placeholder so pages look finished
 * before artwork exists.
 */
export default function Tile({ image, alt, ratio = "1 / 1", seed = alt, className = "" }: Props) {
  const t = hash(seed);
  const style = {
    aspectRatio: ratio,
    "--tile-x": `${20 + t * 60}%`,
    "--tile-y": `${25 + (1 - t) * 50}%`,
    "--tile-l": `${8 + t * 10}%`,
  } as CSSProperties;

  return (
    <div className={`tile${image ? "" : " tile--empty"} ${className}`.trim()} style={style}>
      {image ? <img src={image} alt={alt} loading="lazy" /> : <span className="tile__grain" aria-hidden="true" />}
    </div>
  );
}
