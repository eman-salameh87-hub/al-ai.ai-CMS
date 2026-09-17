// components/site/blocks/heading-arrow.tsx
//
// Renders the LITERAL markup from al-ai.ai-pages/index.html's "Where AI
// Creates Impact" section: a plain heading beside the source's big
// diagonal-arrow decoration (.tt-big-arrow) — not a bare generic heading
// block, which has no column to put the arrow in.
interface HeadingArrowProps {
  heading: string;
}

export function HeadingArrow({ heading }: HeadingArrowProps) {
  return (
    <div className="tt-section tt-wrap padding-top-xlg-140 border-top">
      <div className="tt-row">
        <div className="tt-col-xl-9">
          <div className="tt-heading tt-heading-xxxlg">
            <h2 className="tt-heading-title tt-text-reveal">{heading}</h2>
          </div>
        </div>

        <div className="tt-col-xl-3 tt-align-self-center">
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
