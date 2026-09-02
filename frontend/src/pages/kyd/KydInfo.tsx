import { Link } from "react-router-dom";
import SiteShell from "../../components/SiteShell";
import Tile from "../../components/Tile";
import { booking } from "../../data/site";

/** Booking / EPK. Administrative on purpose. */
export default function KydInfo() {
  return (
    <SiteShell section="kyd">
      <div className="nc-booking">
        <div className="nc-booking__col">
          <div className="nc-booking__block">
            <span>BOOKING</span>
          </div>

          <ul className="nc-booking__block">
            {booking.services.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>

          {booking.contacts.map((c) => (
            <div className="nc-booking__block" key={c.label}>
              <span className="nc-muted">{c.label}</span>
              <a href={`mailto:${c.email}`}>{c.email}</a>
            </div>
          ))}

          <div className="nc-booking__links">
            {booking.links.map((l) =>
              l.href.startsWith("/") ? (
                <Link key={l.label} className="nc-link" to={l.href}>
                  {l.label}
                </Link>
              ) : (
                <a key={l.label} className="nc-link" href={l.href}>
                  {l.label}
                </a>
              ),
            )}
          </div>
        </div>

        <Tile image={booking.photo} alt="KYD" ratio="4 / 5" seed="kyd-booking" className="nc-booking__photo" />
      </div>
    </SiteShell>
  );
}
