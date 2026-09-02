import { Link } from "react-router-dom";
import SiteShell from "../../components/SiteShell";
import Tile from "../../components/Tile";
import { projects } from "../../data/site";

/** KYD home — music as a product grid. */
export default function KydMusic() {
  return (
    <SiteShell section="kyd">
      <section className="nc-section">
        <div className="nc-label">
          <span>ALL PROJECTS</span>
          <span className="nc-muted">{projects.length}</span>
        </div>
        <div className="nc-grid">
          {projects.map((p) => (
            <Link key={p.slug} to={`/kyd/${p.slug}`} className="nc-card">
              <Tile image={p.image} alt={p.title} seed={p.slug} />
              <div className="nc-card__meta">
                <span>{p.title}</span>
                <span className="nc-muted">{p.year}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </SiteShell>
  );
}
