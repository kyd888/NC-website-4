import SiteShell from "../../components/SiteShell";
import Tile from "../../components/Tile";
import { visuals } from "../../data/site";

/** Videos and posters, same grid as everything else. */
export default function KydVisuals() {
  return (
    <SiteShell section="kyd">
      <section className="nc-section">
        <div className="nc-label">
          <span>VISUALS</span>
          <span className="nc-muted">{visuals.length}</span>
        </div>
        <div className="nc-grid">
          {visuals.map((v) => {
            const inner = (
              <>
                <Tile image={v.image} alt={v.title} ratio="4 / 5" seed={v.id} />
                <div className="nc-card__meta">
                  <span>{v.title}</span>
                  <span className="nc-muted">{v.year}</span>
                </div>
              </>
            );
            return v.url ? (
              <a key={v.id} className="nc-card" href={v.url} target="_blank" rel="noreferrer">
                {inner}
              </a>
            ) : (
              <div key={v.id} className="nc-card">
                {inner}
              </div>
            );
          })}
        </div>
      </section>
    </SiteShell>
  );
}
