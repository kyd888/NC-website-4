import { Link } from "react-router-dom";
import "../site.css";

/**
 * Opening screen. Two doors, nothing else.
 * Left → the shop. Right → KYD. Events / Booking sit quietly at the bottom.
 */
export default function Gateway() {
  return (
    <div className="nc-site">
      <div className="nc-gateway">
        <div className="nc-gateway__top">
          <span>NO CONNECTION</span>
          <Link to="/shop">ENTER SITE</Link>
        </div>

        <div className="nc-gateway__doors">
          <Link to="/shop" className="nc-gateway__door">
            <h2>NO CONNECTION</h2>
            <span>SHOP / OBJECTS</span>
          </Link>
          <Link to="/kyd" className="nc-gateway__door">
            <h2>KYD</h2>
            <span>MUSIC / ARTIST</span>
          </Link>
        </div>

        <div className="nc-gateway__bottom">
          <Link to="/events">EVENTS</Link>
          <Link to="/kyd/info">BOOKING</Link>
        </div>
      </div>
    </div>
  );
}
