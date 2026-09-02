import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../site.css";

type Door = "nc" | "kyd";

const DOORS: Record<Door, { to: string; title: string; sub: string }> = {
  nc: { to: "/shop", title: "NO CONNECTION", sub: "SHOP / OBJECTS" },
  kyd: { to: "/kyd", title: "KYD", sub: "MUSIC / ARTIST" },
};

/** How long the chosen word takes to fill the viewport before the page swaps. */
const LEAVE_MS = 420;

/**
 * Opening screen. Two doors, nothing else.
 * Each door is one big tappable panel. Tapping it makes the word swell to fill
 * the viewport, then the page swaps — that swell is the "enter", so there is
 * no button that says so. Events / Booking sit quietly at the bottom.
 */
export default function Gateway() {
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState<Door | null>(null);
  const titles = useRef<Record<Door, HTMLSpanElement | null>>({ nc: null, kyd: null });
  const timer = useRef<number>();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const enter = (door: Door) => (e: MouseEvent<HTMLAnchorElement>) => {
    // Modified clicks (new tab, etc.) keep native link behaviour.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (leaving) return;

    const el = titles.current[door];
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!el || reduceMotion) {
      navigate(DOORS[door].to);
      return;
    }

    // Grow the word until it spans the viewport edge to edge, centred on screen.
    const r = el.getBoundingClientRect();
    const fill = Math.max(1.6, (window.innerWidth * 1.04) / r.width);
    const dx = window.innerWidth / 2 - (r.left + r.width / 2);
    const dy = window.innerHeight / 2 - (r.top + r.height / 2);
    el.style.setProperty("--fill", fill.toFixed(3));
    el.style.setProperty("--dx", `${dx.toFixed(1)}px`);
    el.style.setProperty("--dy", `${dy.toFixed(1)}px`);

    setLeaving(door);
    timer.current = window.setTimeout(() => navigate(DOORS[door].to), LEAVE_MS);
  };

  const door = (key: Door) => {
    const d = DOORS[key];
    const isLeaving = leaving === key;
    return (
      <Link
        to={d.to}
        className={`gateway__door gateway__door--${key}${isLeaving ? " is-leaving" : ""}`}
        onClick={enter(key)}
        aria-label={`${d.title} — ${d.sub}`}
      >
        <h2 className="gateway__title">
          <span
            className="gateway__word"
            ref={(node) => {
              titles.current[key] = node;
            }}
          >
            {d.title}
          </span>
        </h2>
        <span className="gateway__sub">{d.sub}</span>
      </Link>
    );
  };

  return (
    <div className={`gateway${leaving ? " is-leaving" : ""}`} aria-busy={leaving ? true : undefined}>
      <div className="gateway__top">
        <img className="brand-logo" src="/nc-star.png" alt="No Connection" />
      </div>

      <div className="gateway__doors">
        {door("nc")}
        {door("kyd")}
      </div>

      <nav className="gateway__bottom" aria-label="Utility">
        <Link to="/events">Events</Link>
        <Link to="/kyd/info">Booking</Link>
      </nav>
    </div>
  );
}
