// components/site/blocks/page-header-full.tsx
import { Fragment } from 'react';

// Renders the LITERAL markup from contact.html's `#page-header` — the
// full-viewport, centered variant used by contact.html, digital-media.html
// and search-engine.html (`ph-full ph-full-m ph-cap-xxxxlg ph-center`),
// which is structurally different from page-header-banner.tsx's
// `ph-cap-lg` variant: background-image is set inline directly on
// #page-header (no .ph-image wrapper/<img>), and there's a subtitle +
// title + description caption (not eyebrow + title + text), duplicated
// once more inside `.ph-mask` for theme.js's cursor reveal effect.
//
// page-header-banner.tsx's own file comment flagged this as an
// unreproduced approximation for these three pages; rendering the cap-lg
// shape here instead of this one is exactly why contact.html's banner
// didn't line up with the tt-wrap content below it — the two variants
// have different container/padding rules in theme-black.css.
interface PageHeaderFullProps {
  image: string;
  subtitle?: string;
  /** May contain a literal "\n" for the source's mid-title <br>. */
  title: string;
  /** May contain a literal "\n" for the source's mid-description <br>. */
  description?: string;
}

function Caption({ subtitle, title, description }: Omit<PageHeaderFullProps, 'image'>) {
  const titleLines = title.split('\n');
  const descLines = description?.split('\n') ?? [];

  return (
    <div className="ph-caption">
      <div className="ph-caption-inner">
        {subtitle && <h2 className="ph-caption-subtitle">{subtitle}</h2>}

        <h1 className="ph-caption-title">
          {titleLines.map((line, idx) => (
            <Fragment key={idx}>
              {idx > 0 && <br />}
              {line}
            </Fragment>
          ))}
        </h1>

        {description && (
          <div className="ph-caption-description max-width-700">
            {descLines.map((line, idx) => (
              <Fragment key={idx}>
                {idx > 0 && <br />}
                {line}
              </Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function PageHeaderFull({ image, subtitle, title, description }: PageHeaderFullProps) {
  return (
    <div
      id="page-header"
      className="ph-full ph-full-m ph-cap-xxxxlg ph-center ph-image-parallax ph-caption-parallax cover-opacity-3"
      style={{
        backgroundImage: `url('${image}')`,
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
      }}
    >
      <div className="page-header-inner tt-wrap">
        <Caption subtitle={subtitle} title={title} description={description} />
      </div>

      <div className="page-header-inner ph-mask">
        <div className="ph-mask-inner tt-wrap">
          <Caption subtitle={subtitle} title={title} description={description} />
        </div>
      </div>

      <div className="tt-scroll-down">
        <a href="#tt-page-content" className="tt-scroll-down-inner tt-magnetic-item" data-offset="0">
          <div className="tt-scrd-icon" />
          <svg viewBox="0 0 500 500">
            <defs>
              <path
                id="textcircle"
                d="M50,250c0-110.5,89.5-200,200-200s200,89.5,200,200s-89.5,200-200,200S50,360.5,50,250"
              />
            </defs>
            <text dy="30">
              <textPath xlinkHref="#textcircle">Scroll to Explore - Scroll to Explore -</textPath>
            </text>
          </svg>
        </a>
      </div>
    </div>
  );
}
