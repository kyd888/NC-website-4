import { Link } from "react-router-dom";
import "../site.css";

/**
 * Opening screen. Two doors, nothing else.
 * Left → the shop. Right → KYD. Events / Booking sit quietly at the bottom.
 */
export default function Gateway() {
  return (
    <div className="gateway">
      <div className="gateway__top">
        <span className="brand-text">NO CONNECTION</span>
        <Link to="/shop" className="pill-btn">
          Enter site
        </Link>
      </div>

      <div className="gateway__doors">
        <Link to="/shop" className="gateway__door">
          <h2>No Connection</h2>
          <span className="label">Shop / Objects</span>
        </Link>
        <Link to="/kyd" className="gateway__door">
          <h2>KYD</h2>
          <span className="label">Music / Artist</span>
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
