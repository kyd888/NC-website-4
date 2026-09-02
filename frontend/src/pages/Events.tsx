import { useSearchParams } from "react-router-dom";
import SiteShell from "../components/SiteShell";
import Tile from "../components/Tile";
import { events, formatShowDate, isPast, shows, type Show } from "../data/site";

/**
 * One events page for both worlds. No Connection events and KYD shows are
 * merged into a single timeline; the filter strip tells them apart, and in
 * ALL each entry carries its world as a small label.
 */
type Kind = "nc" | "kyd";
type Entry = Show & { kind: Kind };

const FILTERS: { key: "all" | Kind; label: string }[] = [
  { key: "all", label: "All" },
  { key: "nc", label: "No Connection" },
  { key: "kyd", label: "KYD Live" },
];

const KIND_LABEL: Record<Kind, string> = { nc: "No Connection", kyd: "KYD Live" };

const ALL: Entry[] = [
  ...events.map((e) => ({ ...e, kind: "nc" as const })),
  ...shows.map((s) => ({ ...s, kind: "kyd" as const })),
];

export default function Events() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("show");
  const filter: "all" | Kind = raw === "nc" || raw === "kyd" ? raw : "all";

  const pool = filter === "all" ? ALL : ALL.filter((e) => e.kind === filter);
  const upcoming = pool.filter((e) => !isPast(e.date)).sort((a, b) => a.date.localeCompare(b.date));
  const past = pool.filter((e) => isPast(e.date)).sort((a, b) => b.date.localeCompare(a.date));

  const select = (key: "all" | Kind) => {
    const next = new URLSearchParams(params);
    if (key === "all") next.delete("show");
    else next.set("show", key);
    setParams(next, { replace: true });
  };

  return (
    <SiteShell section="nc">
      <section className="block">
        <div className="label-row">
          <h1 className="page-title">Events</h1>
          <span className="label">Upcoming</span>
        </div>

        <nav className="tabs" aria-label="Filter events">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`tab${filter === f.key ? " is-active" : ""}`}
              aria-pressed={filter === f.key}
              onClick={() => select(f.key)}
            >
              {f.label}
            </button>
          ))}
        </nav>

        {upcoming.length === 0 && <p className="muted">Nothing scheduled.</p>}

        {upcoming.map((ev) => (
          <div className="feature" key={`${ev.kind}-${ev.id}`}>
            <Tile image={ev.poster} alt={`${ev.title} poster`} ratio="4 / 5" seed={ev.id} />
            <div className="feature__meta">
              {filter === "all" && <span className="label">{KIND_LABEL[ev.kind]}</span>}
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
              <a className="list__row" key={`${ev.kind}-${ev.id}`} href={ev.archive ?? "#"}>
                <strong>{ev.title}</strong>
                {filter === "all" && <span className="list__tag">{KIND_LABEL[ev.kind]}</span>}
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
