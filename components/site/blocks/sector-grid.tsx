// components/site/blocks/sector-grid.tsx
//
// Renders the LITERAL markup from al-ai.ai-pages/index.html's
// #portfolio-grid — the isotope/masonry image-card grid ("Powering Every
// Sector") — not a Tailwind grid re-approximation. theme.js initializes
// Isotope against these exact classes (#portfolio-grid, .tt-grid-item,
// .isotope-item); a Tailwind `grid` div never gets picked up by it.
//
// No `columns` prop: the source's layout (ttgr-layout-creative-2) is a
// fixed masonry pattern driven by theme-black.css + Isotope, not a plain
// N-column grid, so there is nothing here for a column count to control.
//
// `tt-wrap` on the root: in index.html, #portfolio-grid is a plain sibling
// DIV *inside* the same `.tt-section.tt-wrap.no-padding-bottom` as the
// "Powering Every Sector" heading (split-intro.tsx's 'sector' variant) —
// it inherits that ancestor's 1282px centered width, it never had its own.
// Our block system renders the heading and the grid as two separate
// top-level blocks, each escaped to the viewport edge by
// content-renderer.tsx's FULL_BLEED wrap (see that file — every `custom`
// block needs that escape to get past the page's own max-w-4xl column).
// Without `tt-wrap` here, that escape left this block with nothing to
// re-constrain it, so the image grid rendered edge-to-edge across the
// full viewport while the heading above it kept its 1282px inset —
// spotted by comparing the two side by side. Not `tt-section`: that
// class's own 80px top/bottom padding and background-color belong to the
// heading block's wrapper, which is still there — adding it again here
// would double both.
interface SectorItem {
  title: string;
  description: string;
  image: string;
}

interface SectorGridProps {
  items: SectorItem[];
}

export function SectorGrid({ items }: SectorGridProps) {
  return (
    <div id="portfolio-grid" className="tt-wrap pgi-hover">
      <div className="tt-grid ttgr-layout-creative-2 ttgr-gap-4">
        <div className="tt-grid-items-wrap isotope-items-wrap margin-top-40">
          {items.map((item, idx) => (
            <div key={idx} className="tt-grid-item isotope-item">
              <div className="ttgr-item-inner">
                <div className="portfolio-grid-item">
                  <div className="pgi-image-wrap">
                    <div className="pgi-image-holder">
                      <div className="pgi-image-inner tt-anim-zoomin">
                        <figure className="pgi-image ttgr-height cover-opacity-2">
                          {/* eslint-disable-next-line @next/next/no-img-element -- literal source markup, see file header. */}
                          <img src={item.image} loading="lazy" alt="image" />
                        </figure>
                      </div>
                    </div>
                  </div>

                  <div className="pgi-caption">
                    <div className="pgi-caption-inner">
                      <h2 className="pgi-title">{item.title}</h2>
                      <div className="pgi-categories-wrap">
                        <div className="pgi-category">{item.description}</div>
                      </div>
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
