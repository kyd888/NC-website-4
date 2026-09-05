import { Link } from "react-router-dom";
import "../site.css";

/**
 * Opening screen. Two doors, nothing else.
 * Left → the shop. Right → KYD. Events / Booking sit quietly at the bottom.
 *
 * Both doors share one markup shape (title, subtitle, Enter pill) so they can
 * never drift out of sync visually, and the pill gives touch users a plain
 * "this is a button" signal that hover alone can't provide.
 */
export default function Gateway() {
  return (
    <div className="gateway">
      <div className="gateway__top">
        <span className="brand-text">NO CONNECTION</span>
      </div>

      <span className="gateway__hint">Choose one</span>

      <div className="gateway__doors">
        <Link to="/shop" className="gateway__door">
          <h2>No Connection</h2>
          <span className="label">Shop / Objects</span>
          <span className="pill-btn is-dark gateway__enter" aria-hidden="true">
            Enter →
          </span>
        </Link>
        <Link to="/kyd" className="gateway__door">
          <h2>KYD</h2>
          <span className="label">Music / Artist</span>
          <span className="pill-btn is-dark gateway__enter" aria-hidden="true">
            Enter →
          </span>
        </Link>
      </div>

      <div className="gateway__bottom">
        <Link to="/events" className="pill-btn is-ghost">
          Events
        </Link>
        <Link to="/kyd/info" className="pill-btn is-ghost">
          Booking
        </Link>
      </div>
    </div>
  );
}
