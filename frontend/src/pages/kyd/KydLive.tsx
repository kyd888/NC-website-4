import SiteShell from "../../components/SiteShell";
import Tile from "../../components/Tile";
import { formatShowDate, isPast } from "../../data/site";
import { useKydContent } from "../../hooks/useKydContent";

/**
 * Shows as products. Poster, title, date, city.
 * Upcoming → Tickets / Info. Past → Archive. History builds itself.
 */
export default function KydLive() {
  const { shows } = useKydContent();
  const upcoming = shows.filter((s) => !isPast(s.date)).sort((a, b) => a.date.localeCompare(b.date));
  const past = shows.filter((s) => isPast(s.date)).sort((a, b) => b.date.localeCompare(a.date));

  const renderCard = (s: (typeof shows)[number], done: boolean) => (
    <div className="card" key={s.id}>
      <Tile image={s.poster} alt={`${s.title} poster`} ratio="4 / 5" seed={s.id} />
      <div className="card__meta">
        <span className="card__title">{s.title}</span>
        <span className="card__sub">{formatShowDate(s.date)}</span>
        <span className="card__sub">{s.city}</span>
        {s.venue && <span className="card__sub">{s.venue}</span>}
      </div>
      <div className="card__actions">
        {done ? (
          <a className="pill-btn" href={s.archive ?? "#"}>
            Archive
          </a>
        ) : (
          <>
            <a className="pill-btn is-dark" href={s.tickets ?? "#"} target={s.tickets ? "_blank" : undefined} rel="noreferrer">
              Tickets
            </a>
            {s.info && (
              <a className="pill-btn" href={s.info}>
                Info
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );

  return (
    <SiteShell section="kyd">
      <section className="block">
        <div className="label-row">
          <h1 className="page-title">Live</h1>
          <span className="label">Upcoming</span>
        </div>
        {upcoming.length === 0 ? (
          <p className="muted">No dates announced.</p>
        ) : (
          <div className="grid grid--wide">{upcoming.map((s) => renderCard(s, false))}</div>
        )}
      </section>

      {past.length > 0 && (
        <section className="block">
          <div className="label-row label-row--rule">
            <span className="label">Past shows</span>
            <span className="label">{past.length}</span>
          </div>
          <div className="grid grid--wide">{past.map((s) => renderCard(s, true))}</div>
        </section>
      )}
    </SiteShell>
  );
}
