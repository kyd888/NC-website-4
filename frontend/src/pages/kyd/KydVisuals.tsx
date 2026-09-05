import SiteShell from "../../components/SiteShell";
import Tile from "../../components/Tile";
import { useKydContent } from "../../hooks/useKydContent";

/** Videos and posters, same grid as everything else. */
export default function KydVisuals() {
  const { visuals } = useKydContent();
  return (
    <SiteShell section="kyd">
      <section className="block">
        <div className="label-row">
          <h1 className="page-title">Visuals</h1>
          <span className="label">{visuals.length}</span>
        </div>
        <div className="grid">
          {visuals.map((v) => {
            const inner = (
              <>
                <Tile image={v.image} alt={v.title} ratio="4 / 5" seed={v.id} />
                <div className="card__meta">
                  <span className="card__title">{v.title}</span>
                  <span className="card__sub">{v.year}</span>
                </div>
              </>
            );
            return v.url ? (
              <a key={v.id} className="card" href={v.url} target="_blank" rel="noreferrer">
                {inner}
              </a>
            ) : (
              <div key={v.id} className="card">
                {inner}
              </div>
            );
          })}
        </div>
      </section>
    </SiteShell>
  );
}
