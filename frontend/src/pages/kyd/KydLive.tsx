import SiteShell from "../../components/SiteShell";
import Tile from "../../components/Tile";
import { formatShowDate, isPast, shows } from "../../data/site";

/**
 * Shows as products. Poster, title, date, city.
 * Upcoming → TICKETS / INFO. Past → ARCHIVE. History builds itself.
 */
export default function KydLive() {
  const upcoming = shows.filter((s) => !isPast(s.date)).sort((a, b) => a.date.localeCompare(b.date));
  const past = shows.filter((s) => isPast(s.date)).sort((a, b) => b.date.localeCompare(a.date));

  const renderCard = (s: (typeof shows)[number], done: boolean) => (
    <div className="nc-card" key={s.id}>
      <Tile image={s.poster} alt={`${s.title} poster`} ratio="4 / 5" seed={s.id} />
      <div className="nc-card__meta">
        <span>{s.title}</span>
        <span>{formatShowDate(s.date)}</span>
        <span>{s.city}</span>
        {s.venue && <span className="nc-muted">{s.venue}</span>}
      </div>
      <div className="nc-card__actions">
        {done ? (
          <a className="nc-link" href={s.archive ?? "#"}>
            ARCHIVE
          </a>
        ) : (
          <>
            <a className="nc-link" href={s.tickets ?? "#"} target={s.tickets ? "_blank" : undefined} rel="noreferrer">
              TICKETS
            </a>
            {s.info && (
              <a className="nc-link" href={s.info}>
                INFO
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );

  return (
    <SiteShell section="kyd">
      <section className="nc-section">
        <div className="nc-label">
          <span>UPCOMING</span>
        </div>
        {upcoming.length === 0 ? (
          <p className="nc-muted">NO DATES.</p>
        ) : (
          <div className="nc-grid nc-grid--wide">{upcoming.map((s) => renderCard(s, false))}</div>
        )}
      </section>

      {past.length > 0 && (
        <section className="nc-section">
          <div className="nc-label nc-label--rule">
            <span>PAST SHOWS</span>
            <span className="nc-muted">{past.length}</span>
          </div>
          <div className="nc-grid nc-grid--wide">{past.map((s) => renderCard(s, true))}</div>
        </section>
      )}
    </SiteShell>
  );
}
