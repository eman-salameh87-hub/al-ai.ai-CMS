// components/site/blocks/service-panels.tsx
//
// Renders the LITERAL markup from al-ai.ai-pages/index.html for two
// structurally different sections that both happen to be "a row of service
// summaries with a title, description and a Read More link" at the data
// level — not a Tailwind re-approximation (see navbar.tsx's header comment
// for why literal markup matters: theme-black.css/theme.js only style and
// drive elements bearing these exact class names).
//
// 'panels' variant = the 3-item horizontal accordion
// (.tt-horizontal-accordion.tt-hac-alter-hover > .tt-hac-item), wrapped in
// its own .tt-section.tt-wrap.
//
// 'cards' variant = the FULL "Empower growth with AI" two-column sticky
// section (.tt-sticker > .tt-row: a sticky heading+text+button in
// .tt-col-lg-5, the 5-card .tt-sticky-testimonials stack in .tt-col-lg-6).
// That sticky heading is part of THIS component (via the sticky* props)
// rather than a separate generic heading block, because in the source it
// lives inside the same two-column row as the cards — a standalone heading
// block above it can't reproduce that layout.
interface ServiceItem {
  title: string;
  description: string;
  buttonText?: string;
  buttonUrl?: string;
}

interface ServicePanelsProps {
  items: ServiceItem[];
  /** 'panels' = the 3-item horizontal accordion. 'cards' = the 5-item sticky testimonial-style stack. */
  variant?: 'panels' | 'cards';
  /** 'cards' variant only — the sticky left column's own heading block. */
  stickySubtitle?: string;
  stickyTitle?: string;
  stickyText?: string;
  stickyButtonText?: string;
  stickyButtonUrl?: string;
}

function splitTitle(title: string) {
  const [line1, line2] = title.split('\n');
  return (
    <>
      {line1}
      {line2 && (
        <>
          <br />
          {line2}
        </>
      )}
    </>
  );
}

export function ServicePanels({
  items,
  variant = 'panels',
  stickySubtitle,
  stickyTitle,
  stickyText,
  stickyButtonText,
  stickyButtonUrl,
}: ServicePanelsProps) {
  if (variant === 'cards') {
    return (
      <div className="tt-section tt-wrap border-bottom">
        <div className="tt-sticker">
          <div className="tt-row">
            <div className="tt-col-lg-5 margin-bottom-40">
              <div className="tt-sticker-sticky tt-sticky-element">
                <div className="tt-heading tt-heading-xxlg no-padding-bottom no-margin padding-bottom-20">
                  {stickySubtitle && <h3 className="tt-heading-subtitle tt-text-reveal">{stickySubtitle}</h3>}
                  {stickyTitle && <h2 className="tt-heading-title tt-text-reveal">{stickyTitle}</h2>}
                  {stickyText && <p className="max-width-500 tt-text-reveal">{stickyText}</p>}
                </div>

                {stickyButtonText && stickyButtonUrl && (
                  <a href={stickyButtonUrl} className="tt-btn tt-btn-outline tt-magnetic-item tt-anim-fadeinup">
                    <span data-hover={stickyButtonText}>{stickyButtonText}</span>
                  </a>
                )}
              </div>
            </div>

            <div className="tt-col-lg-1" />

            <div className="tt-col-lg-6">
              <div className="tt-sticker-scroller">
                <div className="tt-sticky-testimonials tt-stte-reversed-colors">
                  {items.map((item, idx) => (
                    <div key={idx} className="tt-stte-item">
                      <div className="tt-stte-card cursor-alter" style={{ backgroundColor: '#f2f1ee' }}>
                        <div className="tt-stte-card-counter" />
                        <div className="tt-stte-card-caption">
                          <h2 className="tt-haci-title">{splitTitle(item.title)}</h2>
                          <div className="tt-stte-text">{item.description}</div>
                          {item.buttonText && item.buttonUrl && (
                            <div>
                              <a href={item.buttonUrl} className="tt-btn tt-btn-outline tt-magnetic-item">
                                <span data-hover={item.buttonText}>{item.buttonText}</span>
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tt-section tt-wrap" style={{ margin: '0 auto' }}>
      <div className="tt-horizontal-accordion tt-hac-alter-hover tt-anim-fadeinup">
        {items.map((item, idx) => (
          <div key={idx} className="tt-hac-item cursor-alter">
            <div className="tt-hac-item-count" />
            <div className="tt-hac-item-inner">
              <div className="tt-hac-item-content">
                <div className="tt-haci-content-top">
                  <h2 className="tt-haci-title">{splitTitle(item.title)}</h2>
                  <div className="tt-haci-description">{item.description}</div>
                </div>

                {item.buttonText && item.buttonUrl && (
                  <div>
                    <a href={item.buttonUrl} className="tt-btn tt-btn-outline tt-magnetic-item">
                      <span data-hover={item.buttonText}>{item.buttonText}</span>
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
