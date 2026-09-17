// components/site/blocks/split-intro.tsx
//
// Renders the LITERAL markup from al-ai.ai-pages/index.html for two
// two-column intro rows — not a Tailwind re-approximation, same as
// navbar.tsx/peach-hero.tsx (see those files' header comments for why).
//
// 'lead' variant = index.html's "Explore Our Services" row: heading+text+
// button together in .tt-col-xl-8, a plain <img> in .tt-col-xl-4
// (.tt-section.tt-wrap.padding-top-xlg-140.border-top > .tt-row).
//
// 'sector' variant = index.html's "Powering Every Sector" row: the heading
// sits ALONE in .tt-col-xl-8, and the text+button move into .tt-col-xl-4
// (class "powering-every-sector") with no image at all
// (.tt-section.tt-wrap.no-padding-bottom > .tt-row.margin-bottom-xlg-80).
// These two rows are NOT the same shape in the source — hence the variant
// rather than one fixed layout with an optional image.
interface SplitIntroProps {
  variant?: 'lead' | 'sector';
  heading: string;
  text?: string;
  buttonText?: string;
  buttonUrl?: string;
  /** Only used by the 'lead' variant. */
  image?: string;
  imageAlt?: string;
}

export function SplitIntro({
  variant = 'lead',
  heading,
  text,
  buttonText,
  buttonUrl,
  image,
  imageAlt = 'image',
}: SplitIntroProps) {
  const [line1, line2] = heading.split('\n');

  const titleNode = (
    <div className="tt-heading tt-heading-xxxlg">
      <h2 className="tt-heading-title tt-text-reveal">
        {line1}
        {line2 && (
          <>
            <br />
            {' '}
            {line2}
          </>
        )}
      </h2>
    </div>
  );

  const ctaNode = buttonText && buttonUrl && (
    <a
      href={buttonUrl}
      className="tt-btn tt-btn-outline margin-top-10 tt-magnetic-item tt-anim-fadeinup"
    >
      <span data-hover={buttonText}>{buttonText}</span>
    </a>
  );

  if (variant === 'sector') {
    return (
      <div className="tt-section tt-wrap no-padding-bottom">
        <div className="tt-row margin-bottom-xlg-80">
          <div className="tt-col-xl-8">{titleNode}</div>

          <div className="tt-col-xl-4 tt-align-self-start margin-top-30 powering-every-sector">
            {text && <div className="max-width-500 text-pretty tt-text-reveal">{text}</div>}
            {ctaNode}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tt-section tt-wrap padding-top-xlg-140 border-top">
      <div className="tt-row">
        <div className="tt-col-xl-8">
          {titleNode}
          {text && <div className="max-width-500 text-pretty tt-text-reveal">{text}</div>}
          {ctaNode}
        </div>

        {image && (
          <div className="tt-col-xl-4 tt-align-self-start margin-top-30">
            {/* eslint-disable-next-line @next/next/no-img-element -- literal
                source markup: index.html uses a plain <img>, not a fixed-
                dimension component, in this column. */}
            <img src={image} loading="lazy" alt={imageAlt} />
          </div>
        )}
      </div>
    </div>
  );
}
