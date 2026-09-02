import { Link } from "react-router-dom";
import "../site.css";

type Door = "nc" | "kyd";

const DOORS: Record<Door, { to: string; title: string; sub: string }> = {
  nc: { to: "/shop", title: "NO CONNECTION", sub: "SHOP / OBJECTS" },
  kyd: { to: "/kyd", title: "KYD", sub: "MUSIC / ARTIST" },
};

/**
 * Opening screen. Two doors, nothing else.
 * Each door is one big tappable panel; the door you touch stays solid while
 * the other recedes. Events / Booking sit quietly at the bottom.
 */
export default function Gateway() {
  const door = (key: Door) => {
    const d = DOORS[key];
    return (
      <Link to={d.to} className={`gateway__door gateway__door--${key}`} aria-label={`${d.title} — ${d.sub}`}>
        <h2 className="gateway__title">{d.title}</h2>
        <span className="gateway__sub">{d.sub}</span>
      </Link>
    );
  };

  return (
    <div className="gateway">
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
