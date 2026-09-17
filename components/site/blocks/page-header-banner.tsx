// components/site/blocks/page-header-banner.tsx
import { Fragment } from 'react';
//
// Renders the LITERAL markup from al-ai.ai-pages' `ph-cap-lg` page header —
// the banner every one of the plain inner pages (about.html, data-driven.html
// and the rest of the service-detail pages, services.html) opens with:
// #page-header.ph-cap-lg.ph-image-parallax.ph-caption-parallax > .ph-image +
// .page-header-inner.tt-wrap > .ph-caption > .ph-caption-inner (eyebrow /
// title / description) + .tt-scroll-down.
//
// This replaces the generic `slider` block (variant "inner") those pages
// used to render their hero through. That block is a bespoke Tailwind
// carousel — small `text-4xl` title, flex-centered over a ~460px band — not
// this theme's actual page-header. Two things followed directly from that
// mismatch, both reported live against al-ai.ai/about.html: the title
// rendered far smaller than production's `.ph-caption-title` (clamp(48px,
// 5vw, 82px)) and pinned near the top of a short band instead of sitting in
// the vertical middle of `.page-header-inner`'s 300px top/bottom padding,
// and it never got theme.js's page-load reveal — which selects
// `.ph-caption-title`/`.ph-caption-categories` specifically (it wraps each
// word in a `.tt-cap-word` span and slides them up on load) and had no
// literal element of those classes to find. Emitting the real classes gets
// both — sizing/position from theme-black.css, the reveal from theme.js —
// for free, the same reasoning as every other al-ai.ai-pages block in this
// registry.
//
// Three of the ten pages (digital-media.html, search-engine.html,
// contact.html) actually use a different, full-viewport `ph-full.ph-center`
// header instead of this one — not reproduced here yet; they render this
// variant as a reasonable approximation until that shape is built.
interface PageHeaderBannerProps {
  image: string;
  alt: string;
  eyebrow?: string;
  /** May contain a literal "\n" for the source's mid-title <br>. */
  title: string;
  text?: string;
  /** theme-black.css's `.ph-image-cover-N` dark scrim over the image (e.g. "5" = 30% black). */
  cover?: string;
}

export function PageHeaderBanner({ image, alt, eyebrow, title, text, cover }: PageHeaderBannerProps) {
  const titleLines = title.split('\n');

  return (
    <div id="page-header" className="ph-cap-lg ph-image-parallax ph-caption-parallax">
      <div className={cover ? `ph-image ph-image-cover-${cover}` : 'ph-image'} style={{ backgroundColor: '#000' }}>
        <div className="ph-image-inner">
          {/* eslint-disable-next-line @next/next/no-img-element -- literal source markup, see file header. */}
          <img src={image} alt={alt} />
        </div>
      </div>

      <div className="page-header-inner tt-wrap">
        <div className="ph-caption">
          <div className="ph-caption-inner">
            {eyebrow && (
              <div className="ph-caption-categories">
                <span className="ph-caption-category text-site-ink-inverted">{eyebrow}</span>
              </div>
            )}

            {/*
              No wrapping element around each line: theme.js's page-load
              reveal walks `.ph-caption-title`'s DIRECT children, wrapping
              each individual word of a raw text node in its own
              `.tt-cap-word` span and leaving a `<br>` alone. An element
              wrapper here (even a bare <span>) would be handed to that same
              pass as ONE opaque node instead, reveal-wrapped as a single
              unit rather than word by word.
            */}
            <h1 className="ph-caption-title">
              {titleLines.map((line, idx) => (
                <Fragment key={idx}>
                  {idx > 0 && <br />}
                  {line}
                </Fragment>
              ))}
            </h1>

            {text && (
              <div className="ph-caption-categories">
                <span className="ph-caption-category text-site-ink-inverted">{text}</span>
              </div>
            )}
          </div>
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
