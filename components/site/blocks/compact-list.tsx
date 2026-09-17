// components/site/blocks/compact-list.tsx
//
// Renders the LITERAL markup from al-ai.ai-pages/index.html's
// .tt-portfolio-compact-list ("Automation & Optimization" / "Data &
// Predictive Analytics" / "AI-Driven Solutions" strip) — not a Tailwind
// re-approximation, same reasoning as the other al-ai.ai-pages block
// components (see navbar.tsx's header comment).
//
// `.pcli-count` is left empty on purpose: theme.js numbers these itself.
interface CompactItem {
  title: string;
  description: string;
  image: string;
}

interface CompactListProps {
  items: CompactItem[];
}

export function CompactList({ items }: CompactListProps) {
  return (
    <div className="tt-section tt-wrap no-padding">
      <div className="tt-portfolio-compact-list pcl-caption-hover pcl-image-hover">
        <div className="pcli-inner">
          {items.map((item, idx) => (
            <div key={idx} className="pcli-item tt-anim-fadeinup">
              <div className="pcli-item-inner">
                <div className="pcli-col pcli-col-image">
                  <div className="pcli-image cover-opacity-2">
                    {/* eslint-disable-next-line @next/next/no-img-element -- literal source markup, see file header. */}
                    <img src={item.image} loading="lazy" alt="Image" />
                  </div>
                </div>

                <div className="pcli-col pcli-col-count">
                  <div className="pcli-count" />
                </div>

                <div className="pcli-col pcli-col-caption">
                  <div className="pcli-caption">
                    <h2 className="pcli-title">{item.title}</h2>
                    <div className="pcli-categories">
                      <div className="pcli-category">{item.description}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
