import { useCallback, useLayoutEffect, useRef, useState } from "react";

/**
 * A product name that doesn't fit its bar, read out in full: it holds at the
 * start, drifts left just far enough to show the end, holds there, and comes
 * back. Names that already fit are left perfectly still — the drift only
 * appears when something is actually hidden.
 *
 * The clipping box is the parent (.title); this is the text inside it, so the
 * crossfade between products keeps working untouched.
 */
export default function DriftingTitle({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  // How much of the name is hidden past the right edge, in pixels. 0 means it fits.
  const [hidden, setHidden] = useState(0);

  const measure = useCallback(() => {
    const el = ref.current;
    const box = el?.parentElement;
    if (!el || !box) return;
    // The span measures differently in its two states, and this has to give
    // the same answer in both or a re-measure would call off a drift that is
    // already running: while still, it's inline, so scrollWidth reads 0 and
    // its rectangle is the full width of the name; once drifting, it's an
    // inline-block the width of the bar, and scrollWidth is the full name.
    const full = el.scrollWidth || el.getBoundingClientRect().width;
    const room = box.clientWidth || box.getBoundingClientRect().width;
    const over = Math.ceil(full - room);
    setHidden(over > 1 ? over : 0);
  }, []);

  useLayoutEffect(() => {
    measure();
    // The width changes under us in three ways: the bar resizes, a webfont
    // finishes loading and re-measures the text, or the name itself changes.
    const box = ref.current?.parentElement;
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    if (box && observer) observer.observe(box);
    window.addEventListener("resize", measure);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure, text]);

  // Constant reading speed rather than a fixed duration, so a much longer name
  // doesn't race past. The travel is 42% of the cycle; the rest is the holds.
  const seconds = hidden > 0 ? Math.min(20, Math.max(6, hidden / 55 / 0.42)) : 0;

  return (
    <span
      ref={ref}
      className={`title__text${hidden > 0 ? " is-drifting" : ""}`}
      // The full name for anyone hovering, and for anything reading the page.
      title={text}
      style={hidden > 0 ? ({ "--drift-shift": `${hidden}px`, "--drift-seconds": `${seconds}s` } as React.CSSProperties) : undefined}
    >
      {text}
    </span>
  );
}
