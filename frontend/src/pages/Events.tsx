import SiteShell from "../components/SiteShell";
import Tile from "../components/Tile";
import { events, formatShowDate, isPast } from "../data/site";

/**
 * NO CONNECTION events. One upcoming event featured with its poster,
 * everything past collapses to a sparse list of codes.
 */
export default function Events() {
  const upcoming = events.filter((e) => !isPast(e.date)).sort((a, b) => a.date.localeCompare(b.date));
  const past = events.filter((e) => isPast(e.date)).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <SiteShell section="nc">
      <section className="nc-section">
        <div className="nc-label">
          <span>EVENTS</span>
        </div>
        <div className="nc-label">
          <span className="nc-muted">UPCOMING</span>
        </div>

        {upcoming.length === 0 && <p className="nc-muted">NOTHING SCHEDULED.</p>}

        {upcoming.map((ev) => (
          <div className="nc-feature" key={ev.id}>
            <Tile image={ev.poster} alt={`${ev.title} poster`} ratio="4 / 5" seed={ev.id} />
            <div className="nc-feature__meta">
              <span>{ev.title}</span>
              <span>{formatShowDate(ev.date)}</span>
              <span>{ev.city}</span>
              {ev.venue && <span className="nc-muted">{ev.venue}</span>}
              <div className="nc-card__actions">
                <a className="nc-link" href={ev.info ?? "#"}>
                  INFO
                </a>
                <a className="nc-link" href={ev.tickets ?? "#"}>
                  TICKETS
                </a>
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="nc-section">
        <div className="nc-label">
          <span className="nc-muted">PAST</span>
        </div>
        <ul className="nc-list">
          {past.map((ev) => (
            <li className="nc-list__row" key={ev.id}>
              <span>{ev.title}</span>
              <span>{formatShowDate(ev.date)}</span>
              <a className="nc-link" href={ev.archive ?? "#"} aria-label={`${ev.title} archive`}>
                {""}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </SiteShell>
  );
}
