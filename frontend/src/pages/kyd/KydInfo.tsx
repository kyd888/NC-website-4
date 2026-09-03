import { Link } from "react-router-dom";
import SiteShell from "../../components/SiteShell";
import Tile from "../../components/Tile";
import { useKydContent } from "../../hooks/useKydContent";

/** Booking / EPK. Administrative on purpose. */
export default function KydInfo() {
  const { booking } = useKydContent();
  return (
    <SiteShell section="kyd">
      <div className="booking">
        <div className="booking__col">
          <h1 className="page-title">Booking</h1>

          <div className="booking__block">
            <span className="label">Available for</span>
            <ul>
              {booking.services.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>

          {booking.contacts.map((c) => (
            <div className="booking__block" key={c.label}>
              <span className="label">{c.label}</span>
              <a href={`mailto:${c.email}`}>{c.email}</a>
            </div>
          ))}

          <div className="booking__links">
            {booking.links.map((l) =>
              l.href.startsWith("/") ? (
                <Link key={l.label} className="pill-btn" to={l.href}>
                  {l.label}
                </Link>
              ) : (
                <a key={l.label} className="pill-btn" href={l.href}>
                  {l.label}
                </a>
              ),
            )}
          </div>
        </div>

        <Tile image={booking.photo} alt="KYD" ratio="4 / 5" seed="kyd-booking" className="booking__photo" />
      </div>
    </SiteShell>
  );
}
