import SiteShell from "../../components/SiteShell";
import { formatShowDate, isPast } from "../../data/site";
import { useKydContent } from "../../hooks/useKydContent";

/**
 * A simple show history with only the title, date and location.
 */
export default function KydLive() {
  const { shows } = useKydContent();
  const upcoming = shows.filter((s) => !isPast(s.date)).sort((a, b) => a.date.localeCompare(b.date));
  const past = shows.filter((s) => isPast(s.date)).sort((a, b) => b.date.localeCompare(a.date));

  const renderList = (dates: typeof shows) => (
    <div className="show-list">
      {dates.map((show) => (
        <div className="show-list__row" key={show.id}>
          <strong className="show-list__title">{show.title}</strong>
          <span className="show-list__date">{formatShowDate(show.date)}</span>
          <span className="show-list__location">
            {show.city}
            {show.venue ? ` · ${show.venue}` : ""}
          </span>
        </div>
      ))}
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
          renderList(upcoming)
        )}
      </section>

      {past.length > 0 && (
        <section className="block">
          <div className="label-row label-row--rule">
            <span className="label">Past shows</span>
            <span className="label">{past.length}</span>
          </div>
          {renderList(past)}
        </section>
      )}
    </SiteShell>
  );
}
