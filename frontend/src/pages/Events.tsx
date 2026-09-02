import SiteShell from "../components/SiteShell";
import Tile from "../components/Tile";
import { events, formatShowDate, isPast } from "../data/site";

/**
 * NO CONNECTION events. One upcoming event featured with its poster,
 * everything past collapses to a sparse list.
 */
export default function Events() {
  const upcoming = events.filter((e) => !isPast(e.date)).sort((a, b) => a.date.localeCompare(b.date));
  const past = events.filter((e) => isPast(e.date)).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <SiteShell section="nc">
      <section className="block">
        <div className="label-row">
          <h1 className="page-title">Events</h1>
          <span className="label">Upcoming</span>
        </div>

        {upcoming.length === 0 && <p className="muted">Nothing scheduled.</p>}

        {upcoming.map((ev) => (
          <div className="feature" key={ev.id}>
            <Tile image={ev.poster} alt={`${ev.title} poster`} ratio="4 / 5" seed={ev.id} />
            <div className="feature__meta">
              <h2 className="page-title">{ev.title}</h2>
              <span>{formatShowDate(ev.date)}</span>
              <span className="muted">{ev.city}</span>
              {ev.venue && <span className="muted">{ev.venue}</span>}
              <div className="card__actions">
                <a className="pill-btn is-dark" href={ev.tickets ?? "#"}>
                  Tickets
                </a>
                <a className="pill-btn" href={ev.info ?? "#"}>
                  Info
                </a>
              </div>
            </div>
          </div>
        ))}
      </section>

      {past.length > 0 && (
        <section className="block">
          <div className="label-row">
            <span className="label">Past</span>
            <span className="label">{past.length}</span>
          </div>
          <div className="list">
            {past.map((ev) => (
              <a className="list__row" key={ev.id} href={ev.archive ?? "#"}>
                <strong>{ev.title}</strong>
                <span>{formatShowDate(ev.date)}</span>
                <span aria-hidden="true">→</span>
              </a>
            ))}
          </div>
        </section>
      )}
    </SiteShell>
  );
}
