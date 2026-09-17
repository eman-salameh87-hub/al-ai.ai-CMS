// components/site/blocks/content-section.tsx
//
// Renders the LITERAL markup from al-ai.ai-pages' 8 service-detail templates
// (data-driven.html, agentic-AI-and-multi-agent-systems.html,
// conversational-and-edge-analytics.html, automated-decision-making-and-BPA.html,
// polarization-and-pre-indoctrination.html, behavioral-intelligence.html,
// digital-media.html, search-engine.html) — every one of these repeats the
// SAME section shape 4-5 times with different copy: a heading (+ optional
// intro paragraph) in a wide column, an optional image in a narrow column,
// and an optional row of "label + bullet list" cards (theme-black.css's
// plain .text-muted/<ul> pattern, not a custom card component).
//
// The source varies the exact bootstrap column spans row-by-row (5/6 for a
// plain heading+text row, 7/4/4/4/4 for one with an image and 3 flat
// columns, 7/4/12>4x3 for one that nests the columns in their own row) —
// most of that is cosmetic; theme-black.css's .tt-row is a flex-wrap
// container, so a flat list of columns that sums past 12 wraps onto its own
// line exactly like an explicitly-nested one does. By default this component
// emits headingSpan (7) + a 1-col spacer + an optional image column + N flat
// bullet-list columns (3-col span for 4 columns, 4-col span for 3), which
// reproduces most of those source variants' visual result without needing a
// prop for the nesting choice itself. A shape the default doesn't cover —
// e.g. automated-decision-making-and-BPA.html's "MDP Framework" row, a
// single lg-5 column beside an lg-6 heading, not lg-3/lg-4 beside lg-7 —
// takes explicit `headingSpan`/`columnSpan` instead of forcing the default
// formula to guess right for every shape it was never designed to cover.
interface ContentSectionColumn {
  label: string;
  items: string[];
}

interface ContentSectionProps {
  /** May contain a literal "\n" for the source's <br> mid-heading. */
  heading: string;
  intro?: string;
  image?: string;
  imageAlt?: string;
  columns?: ContentSectionColumn[];
  /** Bootstrap-style span (of 12) for the heading column. Default 7. */
  headingSpan?: number;
  /** Bootstrap-style span (of 12) per bullet-list column. Default: 4 for
   *  exactly 3 columns, 3 otherwise — set this explicitly when a section's
   *  real column count doesn't fit that guess (see file header). */
  columnSpan?: number;
  /** All of these sections are border-top except the first on a page. */
  borderTop?: boolean;
}

export function ContentSection({
  heading,
  intro,
  image,
  imageAlt = 'image',
  columns,
  headingSpan = 7,
  columnSpan,
  borderTop = true,
}: ContentSectionProps) {
  const [line1, line2] = heading.split('\n');
  const resolvedColumnSpan = columnSpan ?? (columns && columns.length === 3 ? 4 : 3);

  return (
    <div className={`tt-section tt-wrap${borderTop ? ' border-top' : ''}`}>
      <div className="tt-row">
        <div className={`tt-col-lg-${headingSpan}`}>
          <div className="tt-heading tt-heading-xlg">
            <h2 className="tt-heading-title tt-text-reveal">
              {line1}
              {line2 && (
                <>
                  <br />
                  {line2}
                </>
              )}
            </h2>
            {intro && <p>{intro}</p>}
          </div>
        </div>

        <div className="tt-col-lg-1 padding-top-30" />

        {image && (
          <div className="tt-col-lg-4 tt-align-self-center tt-anim-fadeinup margin-bottom-40">
            {/* eslint-disable-next-line @next/next/no-img-element -- literal source markup, see file header. */}
            <img src={image} loading="lazy" alt={imageAlt} />
          </div>
        )}

        {columns?.map((col, idx) => (
          <div
            key={idx}
            className={`tt-col-lg-${resolvedColumnSpan} tt-align-self-center tt-anim-fadeinup margin-bottom-40`}
          >
            <p className="text-muted">{col.label}</p>
            <ul style={{ margin: 0, padding: 0, marginLeft: 15 }}>
              {col.items.map((item, itemIdx) => (
                <li key={itemIdx}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
