import { Link } from "react-router-dom";
import SiteShell from "../../components/SiteShell";
import Tile from "../../components/Tile";
import { projects } from "../../data/site";

/** KYD home — music as a product grid. */
export default function KydMusic() {
  return (
    <SiteShell section="kyd">
      <section className="block">
        <div className="label-row">
          <span className="label">All projects</span>
          <span className="label">{projects.length}</span>
        </div>
        <div className="grid">
          {projects.map((p) => (
            <Link key={p.slug} to={`/kyd/${p.slug}`} className="card">
              <Tile image={p.image} alt={p.title} seed={p.slug} />
              <div className="card__meta">
                <span className="card__title">{p.title}</span>
                <span className="card__sub">{p.year}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </SiteShell>
  );
}
