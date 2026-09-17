// components/site/blocks/round-cta.tsx
//
// Renders the LITERAL markup from al-ai.ai-pages/index.html/about.html's
// "Ready to Launch Your Project?" section — .tt-heading (eyebrow/title/
// text) beside the source's signature big circular "Let's Connect!" button
// (.tt-big-round-ptn) — not a Tailwind re-approximation, same reasoning as
// the other al-ai.ai-pages block components (see navbar.tsx's header
// comment). The generic `cta` ContentBlock renders a rectangular button
// (see content-renderer.tsx), so it can't carry this shape.
//
// `buttonText` may contain a literal "\n" to force the source's two-line
// button label ("Let's<br> Connect!") — needed for the label to stay
// centered inside the fixed-size circle the way the source's does.
interface RoundCtaProps {
  eyebrow?: string;
  title: string;
  text?: string;
  buttonText: string;
  buttonUrl: string;
}

export function RoundCta({ eyebrow, title, text, buttonText, buttonUrl }: RoundCtaProps) {
  const [line1, line2] = buttonText.split('\n');

  return (
    <div className="tt-section tt-wrap padding-top-xlg-120 padding-bottom-xlg-120 border-top">
      <div className="tt-row margin-bottom-40">
        <div className="tt-col-xl-9">
          <div className="tt-heading tt-heading-xxlg no-margin">
            {eyebrow && <h3 className="tt-heading-subtitle tt-text-reveal">{eyebrow}</h3>}
            <h2 className="tt-heading-title tt-text-reveal">{title}</h2>
            {text && <p>{text}</p>}
          </div>
        </div>

        <div className="tt-col-xl-3 tt-align-self-end tt-xl-column-reverse margin-top-4 justify-content-center">
          <div className="tt-big-round-ptn margin-top-30 margin-bottom-xlg-80 tt-anim-fadeinup">
            <a href={buttonUrl} className="tt-big-round-ptn-holder tt-magnetic-item">
              <div className="tt-big-round-ptn-inner">
                {line1}
                {line2 && (
                  <>
                    <br />
                    {line2}
                  </>
                )}
              </div>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
