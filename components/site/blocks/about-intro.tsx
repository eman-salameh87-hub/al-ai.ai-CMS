// components/site/blocks/about-intro.tsx
//
// Renders the LITERAL markup from al-ai.ai-pages/about.html's opening body
// section — "Behind the Code" / "Where Data Meets Creativity" — id
// tt-page-content's first .tt-section (about.html lines 224-274).
//
// This is why it exists as its own component rather than reusing the
// generic `heading`/`paragraph`/`rich-text` blocks the rest of the CMS
// falls back to: in the source, EVERY paragraph here carries the site's
// own `.tt-text-reveal` class directly (theme-black.css/theme.js's
// scroll-linked reveal — text starts at 20%-opacity white and brightens to
// solid white as it scrolls into view), not a static muted colour. The
// generic paragraph block renders `text-site-ink-muted` (a permanently
// dim tone) and the generic rich-text block renders Tailwind Typography's
// `prose` palette — neither ever reaches solid white, and neither
// reproduces the reveal-as-you-scroll effect the source actually has.
// Reported live: this body copy showing "dim/gray" text that should be
// white was exactly this mismatch, not a colour bug to patch in isolation.
interface AboutIntroProps {
  eyebrow: string;
  title: string;
  paragraphs: string[];
  /** Rendered bold, matching the source's closing `<strong>` line. */
  boldParagraph?: string;
}

export function AboutIntro({ eyebrow, title, paragraphs, boldParagraph }: AboutIntroProps) {
  return (
    <div className="tt-section tt-wrap no-padding-bottom padding-bottom-xlg-80 border-top">
      <div className="tt-row">
        <div className="tt-col-xl-10">
          <div className="tt-heading tt-heading-xxxlg">
            <h3 className="tt-heading-subtitle tt-text-reveal">{eyebrow}</h3>
            <h2 className="tt-heading-title tt-text-reveal">{title}</h2>
          </div>

          <div className="tt-text-reveal">
            {paragraphs.map((text, idx) => (
              <p key={idx} className="tt-text-reveal">
                {text}
              </p>
            ))}
            {boldParagraph && (
              <p className="tt-text-reveal">
                <strong>{boldParagraph}</strong>
              </p>
            )}
          </div>
        </div>

        <div className="tt-col-xl-2 tt-align-self-start margin-top-40">
          <div className="tt-big-arrow tt-ba-angle-bottom-left tt-anim-fadeinup">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="M13.025 1l-2.847 2.828 6.176 6.176h-16.354v3.992h16.354l-6.176 6.176 2.847 2.828 10.975-11z" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
