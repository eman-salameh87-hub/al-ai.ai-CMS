// migration/seed-al-ai-pages.ts
//
// Builds 12 of the 13 CMS pages from the al-ai.ai static HTML templates in
// al-ai.ai-pages/{index,about,services,data-driven,...,contact}.html.
//
//   npx tsx --env-file=.env migration/seed-al-ai-pages.ts --dry-run
//   npx tsx --env-file=.env migration/seed-al-ai-pages.ts
//
// COVERAGE: home, about, services, data-driven,
// agentic-ai-and-multi-agent-systems, conversational-and-edge-analytics,
// automated-decision-making-and-bpa, polarization-and-pre-indoctrination,
// behavioral-intelligence, digital-media, search-engine, contact — every
// slug every nav link and "Read More" button on the site actually points
// to. blog-post-sidebar.html is deliberately NOT built: it's the theme's
// generic blog-post-with-sidebar TEMPLATE (used to demo a blog layout, not
// a real page of al-ai.ai content), and this CMS has no blog/post content
// type yet for it to represent — building it now would mean inventing fake
// blog content. Revisit once a blog feature exists.
//
// The 8 "service detail" pages (data-driven, agentic-ai-and-multi-agent-
// systems, conversational-and-edge-analytics, automated-decision-making-
// and-bpa, polarization-and-pre-indoctrination, behavioral-intelligence)
// share one repeating section shape — heading (+ optional intro paragraph)
// + optional image + optional "label + bullet list" columns — reproduced by
// the new `content-section` custom block (components/site/blocks/
// content-section.tsx). digital-media and search-engine are long-form
// prose pages instead (same generic heading/paragraph/image blocks
// about.html's body already uses), and services.html reuses home's own
// sections verbatim (see servicesBody() below) with only the hero swapped.
// None of these 8-plus-2 pages' `#page-header` parallax banners are
// reproduced as literal markup — they reuse the generic `slider` block
// about.html's hero already ships as, just with each page's own eyebrow/
// title/text, to stay in scope rather than adding an 11th custom component
// for a banner shape used only for a title and one line of text.
//
// EVERYTHING HERE IS CONTENT, NOT CODE — same rule as migration/seed-site.ts.
// Every heading, paragraph, card and button below is a typed ContentBlock,
// editable in /admin/content/pages afterwards. Nothing here is a hand-built
// React template standing in for admin-editable content.
//
// REPLACES THE LEGACY PAGES AT THESE SLUGS
//   - `home` already exists (from migration/seed-site.ts) — this OVERWRITES
//     its block body with the al-ai.ai design. Same slug, so no other page
//     moves.
//   - `about` is a NEW slug. The legacy `who-we-are` page is ARCHIVED (not
//     deleted) as part of this run, because about.html is its replacement.
//     Note: this codebase's redirect table only powers /segment/slug routes
//     (admin-created content types), not single-segment built-in pages — so
//     inbound links to /who-we-are will 404, not redirect, until that route
//     gains DB-redirect support. Flagging this rather than silently shipping
//     a broken link.
//
// IMAGES: copied ahead of this script from al-ai.ai-pages/assets/img/new-aeon/
// into public/al-ai-pages/ (banner1.png, digital-art-ai-technology-background.jpg,
// image-inner18.png, marketing2.png, Ai-fashion.png, Manufacturing.png,
// ai-real-state.png, automation-ai.png, data-ai.png, image-inner19.png).
//
// LAYOUT: the generic ContentBlock union (heading/paragraph/accordion/
// feature-grid/cta) can't reproduce index.html's/about.html's actual section
// shapes (2-col intro, image-card grids, circular CTA button), so this page
// is built from `custom` blocks backed by purpose-built, still admin-editable
// components in components/site/blocks/: split-intro, service-panels,
// sector-grid, compact-list, round-cta. See lib/blocks/custom-registry.tsx.
//
// IDEMPOTENT. Re-running rewrites the same rows.
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { content, contentI18n, contentTypes, users } from '@/lib/db/schema';
import type { ContentBlock } from '@/lib/blocks/types';

const DRY_RUN = process.argv.includes('--dry-run');

const report = {
  startedAt: new Date().toISOString(),
  dryRun: DRY_RUN,
  pages: [] as { slug: string; blocks: { en: number; ar: number }; action: string }[],
  archived: [] as string[],
  warnings: [] as string[],
};

// ─── HELPERS ──────────────────────────────────────────────

const heading = (text: string, level: 1 | 2 | 3 | 4 = 2): ContentBlock => ({ type: 'heading', level, text });
const paragraph = (text: string): ContentBlock => ({ type: 'paragraph', text });

/** Bold-body paragraph as rich-text, so the <strong> survives as a real mark. */
const boldParagraph = (text: string): ContentBlock => ({
  type: 'rich-text',
  content: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text, marks: [{ type: 'bold' }] }] }],
  },
});

// ─── HOME ─────────────────────────────────────────────────

function homeBody(locale: 'en' | 'ar'): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  // The real source hero: the site's own PeachWorlds interactive iframe,
  // embedded verbatim via the `peach-hero` custom block
  // (components/site/blocks/peach-hero.tsx) rather than approximated with
  // a static image slider. See that file's header comment for the CSP
  // requirement and the caveat about the preview URL expiring.
  blocks.push({
    type: 'custom',
    component: 'peach-hero',
    // No title/text props: the embed's own scene already carries a caption,
    // so a second one here just duplicated it on top (see peach-hero.tsx).
    props: {
      src: 'https://severe-fncjenao.peachworlds.com/',
    },
  });

  // "Explore Our Services" — index.html's 2-col intro (heading+text+button
  // on the left, image on the right).
  blocks.push({
    type: 'custom',
    component: 'split-intro',
    props: {
      heading: 'Explore Our Services',
      text: 'Unlock the power of AI-driven strategies, intelligent data insights, and next-generation digital marketing.',
      buttonText: 'View All',
      buttonUrl: `/${locale}/services`,
      image: '/al-ai-pages/digital-art-ai-technology-background.jpg',
      imageAlt: 'AI technology',
    },
  });

  // The source's horizontal-scroll accordion of 3 services → service-panels.
  blocks.push({
    type: 'custom',
    component: 'service-panels',
    props: {
      variant: 'panels',
      items: [
        {
          title: 'Data-Driven & AI Solution',
          description: 'We focus our efforts on the crucial pre-processing stage to ensure data is clean, normalized, and optimized for AI applications. This methodical approach ensures high-quality data feeds into our custom AI systems, leading to more accurate predictions and superior outcomes.',
          buttonText: 'Read More',
          buttonUrl: `/${locale}/data-driven`,
        },
        {
          title: 'Agentic AI & Agent Systems',
          description: 'Autonomous AI agents that work independently and collaboratively to achieve business goals. Rather than offering single-purpose AI tools, the company builds an integrated, multi-agent ecosystem designed for seamless goal-driven automation and cross-functional collaboration.',
          buttonText: 'Read More',
          buttonUrl: `/${locale}/agentic-ai-and-multi-agent-systems`,
        },
        {
          title: 'Conversational & Edge Analytics',
          description: 'Our conversational and edge analytics solutions enable seamless human-machine interaction, faster decision-making, and intelligent automation across every customer touchpoint. By combining natural language understanding with real-time data processing, we deliver immediate, actionable insights.',
          buttonText: 'Read More',
          buttonUrl: `/${locale}/conversational-and-edge-analytics`,
        },
      ],
    },
  });

  // "Powering Every Sector" — index.html's OTHER 2-col intro shape: the
  // heading sits alone on the left, the text+button move to the right
  // column, no image (see split-intro.tsx's 'sector' variant).
  blocks.push({
    type: 'custom',
    component: 'split-intro',
    props: {
      variant: 'sector',
      heading: 'Powering Every Sector',
      text: 'Unlock the power of AI-driven strategies, intelligent data insights, and next-generation digital marketing across industries:',
      buttonText: 'View All',
      buttonUrl: `/${locale}/services`,
    },
  });

  // index.html's #portfolio-grid image cards → sector-grid.
  blocks.push({
    type: 'custom',
    component: 'sector-grid',
    props: {
      items: [
        {
          title: 'Marketing & Media',
          description: 'Personalized ad targeting uses data and user behavior to deliver ads that are more relevant to each individual, increasing engagement and conversion rates.',
          image: '/al-ai-pages/marketing2.png',
        },
        {
          title: 'Smart Fashion',
          description: 'Trend forecasting predicts upcoming styles, AI-powered design streamlines creativity, personalized styling tailors recommendations, and virtual try-ons enhance the digital shopping experience.',
          image: '/al-ai-pages/Ai-fashion.png',
        },
        {
          title: 'Manufacturing & Logistics',
          description: 'Predictive maintenance anticipates equipment issues before failure, supply chain optimization improves efficiency and reduces costs, and quality control automation ensures consistent product standards through intelligent monitoring.',
          image: '/al-ai-pages/Manufacturing.png',
        },
        {
          title: 'Real Estate',
          description: 'Property recommendations match users with suitable listings, market predictions analyze data to forecast trends and pricing, and AI-powered inquiry chatbots provide instant, accurate responses to customer questions.',
          image: '/al-ai-pages/ai-real-state.png',
        },
      ],
    },
  });

  // The source's sticky-scroll "Empower growth with AI" section — the
  // sticky heading/text/button AND the 5-card stack are both this one
  // service-panels 'cards' call now (see that file's header comment: they
  // share a single .tt-sticker two-column row in the source, so a
  // standalone heading block above it can't reproduce the layout).
  blocks.push({
    type: 'custom',
    component: 'service-panels',
    props: {
      variant: 'cards',
      stickyTitle: 'Empower growth with AI',
      stickyText: 'Unleash the potential of smart AI solutions, data intelligence, and future-ready digital marketing.',
      stickyButtonText: 'Read More',
      stickyButtonUrl: `/${locale}/services`,
      items: [
        {
          title: 'Automated Decision-Making',
          description: 'Business Process Automation leveraging Multi-Decision Pattern (MDP) frameworks and BPMN implementation for streamlined operations.',
          buttonText: 'Read More',
          buttonUrl: `/${locale}/automated-decision-making-and-bpa`,
        },
        {
          title: 'Polarization & Indoctrination Analysis',
          description: 'Understanding how organizations and markets split into distinct perspectives enables better strategic positioning and market segmentation.',
          buttonText: 'Read More',
          buttonUrl: `/${locale}/polarization-and-pre-indoctrination`,
        },
        {
          title: 'Behavioral Intelligence',
          description: 'Our unique integration of AI, data science, psychology, and entrepreneurship creates a comprehensive "behavioral intelligence" platform that drives customer engagement.',
          buttonText: 'Read More',
          buttonUrl: `/${locale}/behavioral-intelligence`,
        },
        {
          title: 'Search Engine Marketing (SEM)',
          description: 'SEM involves promoting websites by increasing their visibility in search engine results pages (SERPs) primarily through paid advertising — the key differentiator between SEM and SEO.',
          buttonText: 'Read More',
          buttonUrl: `/${locale}/search-engine`,
        },
        {
          title: 'Digital Media Expertise',
          description: 'Professional social media management requires deep expertise beyond personal platform usage. Our team brings strategic thinking, analytics capabilities, and proven methodologies to maximize your social media ROI.',
          buttonText: 'Read More',
          buttonUrl: `/${locale}/digital-media`,
        },
      ],
    },
  });

  // index.html's "Where AI Creates Impact" heading + big-arrow decoration.
  blocks.push({
    type: 'custom',
    component: 'heading-arrow',
    props: { heading: 'Where AI Creates Impact' },
  });

  // index.html's .tt-portfolio-compact-list → compact-list.
  blocks.push({
    type: 'custom',
    component: 'compact-list',
    props: {
      items: [
        {
          title: 'Automation & Optimization',
          description: 'Streamline workflows and enhance decision-making processes.',
          image: '/al-ai-pages/automation-ai.png',
        },
        {
          title: 'Data & Predictive Analytics',
          description: 'Forecast trends and gain actionable insights from your data.',
          image: '/al-ai-pages/data-ai.png',
        },
        {
          title: 'AI-Driven Solutions',
          description: 'Natural Language Processing (NLP), Computer Vision, and Generative AI for content creation, recognition, and intelligent interaction.',
          image: '/al-ai-pages/image-inner19.png',
        },
      ],
    },
  });

  // The source's circular "Let's Connect!" CTA → round-cta.
  blocks.push({
    type: 'custom',
    component: 'round-cta',
    props: {
      eyebrow: 'Contact',
      title: 'Ready to Launch Your Project?',
      text: "Let's create a future where technology doesn't just serve you — it understands you. Connect with us today to start your AI-powered transformation.",
      buttonText: "Let's\nConnect!",
      buttonUrl: `/${locale}/contact`,
    },
  });

  return blocks;
}

// ─── ABOUT ────────────────────────────────────────────────

function aboutBody(locale: 'en' | 'ar'): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  // Literal markup (about.html lines 179-221) — see page-header-banner.tsx
  // for why the generic `slider` block this used to be doesn't reproduce
  // it: this is what was actually reported as too small and not vertically
  // centred, and missing the load-in animation the real page has.
  blocks.push({
    type: 'custom',
    component: 'page-header-banner',
    props: {
      image: '/al-ai-pages/image-inner18.png',
      alt: 'Who We Are',
      eyebrow: 'AI and Digital Agency',
      title: 'Who We Are?',
      text: 'A forward-thinking company that leverages artificial intelligence to automate tasks, improve operational efficiency, and drive smarter business decisions.',
    },
  });

  // Literal markup (about.html lines 224-274): every paragraph here is
  // `.tt-text-reveal` in the source, not the generic paragraph block's
  // static muted text — see about-intro.tsx's header comment for why that
  // distinction is what was actually reported as "text should be white."
  blocks.push({
    type: 'custom',
    component: 'about-intro',
    props: {
      eyebrow: 'Behind the Code',
      title: 'Where Data Meets Creativity',
      paragraphs: [
        'We began our digital journey as an integrated marketing communications (IMC) agency. As the digital landscape evolved, we recognized the need to transform our capabilities to meet emerging market demands. This evolution prompted us to establish our USA office, enabling us to join elite international companies and stay current with the latest industry practices and research.',
        'This transformation marked the birth of al-ai.ai Digital — a name that signifies a new era. We positioned ourselves ahead of the curve, embracing the future of digital innovation.',
        "al-ai.ai is a company established in the USA with operations across multiple countries, delivering services where they're needed most. We've introduced a revolutionary marketing perspective that provides clients with comprehensive online marketing plans supported by integrated strategies and programs. Our approach helps businesses reach their target audiences and achieve their objectives effectively, while guaranteeing measurable results as part of our service agreements.",
        "At al-ai.ai, our mission is to become the premier choice for marketing services in our regions of operation. We bring this vision to life by understanding and addressing our clients' needs and aspirations, approaching each market with deep insight and meticulous attention to detail.",
        'We continuously seek to partner with leading companies and institutions across diverse sectors, contributing to their sales and marketing objectives while ensuring meaningful engagement between these organizations and their target customers. Our company offers more than 16 specialized services in e-commerce and digital marketing, through which we have built an impressive portfolio of success stories.',
        'We maintain accreditation with major global networks including Google, Facebook, and the Interactive Advertising Bureau (IAB). We regularly expand our team with experienced professionals to keep pace with rapid digital advancement.',
      ],
      boldParagraph: 'Let us take you to the future.',
    },
  });

  blocks.push({
    type: 'custom',
    component: 'round-cta',
    props: {
      eyebrow: 'Contact',
      title: 'Ready to Launch Your Project?',
      text: "Let's create a future where technology doesn't just serve you — it understands you. Connect with us today to start your AI-powered transformation.",
      buttonText: "Let's\nConnect!",
      buttonUrl: `/${locale}/contact`,
    },
  });

  return blocks;
}

// ─── SHARED HELPERS FOR THE 10 PAGES BELOW ─────────────────────────────

/** `slider` inner-variant banner, used as every one of these pages' hero
 * (the literal `#page-header` markup — see page-header-banner.tsx — with
 * each page's own image/eyebrow/title/text; every one of these 9 pages
 * uses theme-black.css's `ph-image-cover-5` scrim over the banner image,
 * unlike about.html's own hero, which has none). */
function detailBanner(image: string, title: string, text?: string, eyebrow?: string): ContentBlock {
  return {
    type: 'custom',
    component: 'page-header-banner',
    props: {
      image: `/al-ai-pages/${image}`,
      alt: title.replace(/\n/g, ' '),
      eyebrow,
      title,
      text,
      cover: '5',
    },
  };
}

interface SectionSpec {
  heading: string;
  intro?: string;
  image?: string;
  columns?: { label: string; items: string[] }[];
  /** Overrides ContentSection's default heading-column span (7) — see that
   *  file's header comment for when the default guess doesn't fit. */
  headingSpan?: number;
  /** Overrides ContentSection's default per-column span (4 for 3 columns, 3 otherwise). */
  columnSpan?: number;
  borderTop?: boolean;
}

/** One `content-section` custom block — see components/site/blocks/content-section.tsx. */
function section(spec: SectionSpec): ContentBlock {
  return {
    type: 'custom',
    component: 'content-section',
    props: {
      heading: spec.heading,
      intro: spec.intro,
      image: spec.image ? `/al-ai-pages/${spec.image}` : undefined,
      columns: spec.columns,
      headingSpan: spec.headingSpan,
      columnSpan: spec.columnSpan,
      borderTop: spec.borderTop ?? true,
    },
  };
}

/** The "Ready to Launch Your Project?" round-CTA every one of these pages ends on. */
function detailCta(locale: 'en' | 'ar', text: string): ContentBlock {
  return {
    type: 'custom',
    component: 'round-cta',
    props: {
      eyebrow: 'Contact',
      title: 'Ready to Launch Your Project?',
      text,
      buttonText: "Let's\nConnect!",
      buttonUrl: `/${locale}/contact`,
    },
  };
}

const AGENT_GOAL_TEXT =
  'Autonomous AI agents that work independently and collaboratively to achieve business goals.';

// ─── SERVICES ─────────────────────────────────────────────
// services.html reuses index.html's own sections verbatim (split-intro
// lead+sector, service-panels panels+cards, sector-grid, heading-arrow,
// compact-list, round-cta) — only the hero differs (a video/image banner
// instead of the PeachWorlds embed). So this reuses homeBody()'s blocks
// rather than re-declaring the same content twice.
function servicesBody(locale: 'en' | 'ar'): ContentBlock[] {
  const [, ...withoutHero] = homeBody(locale);
  return [
    detailBanner(
      'digital-art-ai-technology-background.jpg',
      'Services',
      'We combine digital marketing, data science, and machine learning to drive results through intelligent analysis and automation.',
      'AI-Powered Innovation'
    ),
    ...withoutHero,
  ];
}

// ─── DATA-DRIVEN ──────────────────────────────────────────

function dataDrivenBody(locale: 'en' | 'ar'): ContentBlock[] {
  return [
    detailBanner('data-driven-banner.png', 'Data-Driven &\nSolutions', 'We combine digital marketing, data science, and machine learning to drive results through intelligent analysis and automation.', 'AI-Powered Innovation'),
    section({
      heading: 'Our\nApproach',
      intro: 'We focus our efforts on the crucial pre-processing stage to ensure data is clean, normalized, and optimized for AI applications. This methodical approach ensures high-quality data feeds into our custom AI systems, leading to more accurate predictions and superior outcomes.',
      borderTop: false,
    }),
    section({
      heading: 'AI Solutions for Business Value',
      intro: 'After data preparation, our AI solutions are engineered to deliver measurable business benefits to SMEs',
      image: 'image-inner1.png',
      columns: [
        { label: 'Value Creation', items: ['Market gap analysis using AI', 'Competitive intelligence gathering', 'Customer need identification', 'Innovation opportunity discovery', 'Revenue stream diversification'] },
        { label: 'Growth Generation', items: ['Customer segmentation and targeting', 'Personalized marketing campaigns', 'Product recommendation engines', 'Cross-sell and upsell optimization', 'Customer lifetime value maximization'] },
        { label: 'Profitability Magnification', items: ['Dynamic pricing strategies', 'Resource allocation optimization', 'Process efficiency improvements', 'Margin optimization', 'Cost-benefit analysis automation'] },
      ],
    }),
    section({
      heading: 'Implementation\nProcess',
      intro: AGENT_GOAL_TEXT,
      image: 'image-inner2.png',
      columns: [
        { label: 'Phase 1: Data Assessment', items: ['Evaluate current data quality and availability', 'Identify data gaps and requirements', 'Define success metrics and KPIs'] },
        { label: 'Phase 2: Data Preparation', items: ['Clean and normalize existing data', 'Establish data governance frameworks', 'Implement data quality controls'] },
        { label: 'Phase 3: AI Model Development', items: ['Design custom AI models for your specific needs', 'Train models on prepared datasets', 'Validate model accuracy and performance'] },
        { label: 'Phase 4: Deployment & Integration', items: ['Integrate AI solutions with existing systems', 'Deploy models in production environment', 'Monitor performance and optimize'] },
      ],
    }),
    section({
      heading: 'Technology\nStack',
      intro: AGENT_GOAL_TEXT,
      image: 'image-inner3.png',
      columns: [
        { label: 'Data Processing', items: ['Advanced ETL (Extract, Transform, Load) pipelines', 'Real-time data streaming capabilities', 'Scalable cloud infrastructure'] },
        { label: 'Machine Learning', items: ['Supervised and unsupervised learning algorithms', 'Deep learning neural networks', 'Natural language processing (NLP)', 'Computer vision'] },
        { label: 'Analytics & Visualization', items: ['Interactive dashboards', 'Real-time reporting', 'Predictive analytics', 'Prescriptive insights'] },
      ],
    }),
    section({
      heading: 'Industry\nApplications',
      intro: AGENT_GOAL_TEXT,
      image: 'image-inner4.png',
      columns: [
        { label: 'Retail & E-Commerce', items: ['Demand forecasting', 'Inventory optimization', 'Customer churn prediction', 'Price optimization'] },
        { label: 'Financial Services', items: ['Fraud detection', 'Risk assessment', 'Customer segmentation', 'Automated compliance'] },
        { label: 'Healthcare', items: ['Patient outcome prediction', 'Resource optimization', 'Diagnostic assistance', 'Treatment personalization'] },
        { label: 'Manufacturing', items: ['Predictive maintenance', 'Quality control', 'Supply chain optimization', 'Production planning'] },
      ],
    }),
    section({
      heading: 'Why Choose\nOur Data-Driven Solutions?',
      columns: [
        { label: 'Proven Results', items: ['Average 40% improvement in prediction accuracy', '30% reduction in operational costs', '25% increase in customer engagement'] },
        { label: 'Expert Team', items: ['Data scientists with advanced degrees', 'Industry-specific domain experts', 'Certified AI/ML specialists'] },
        { label: 'Scalable Solutions', items: ['Start small and scale as you grow', 'Cloud-based infrastructure', 'Flexible pricing models'] },
        { label: 'Comprehensive Support', items: ['Dedicated project managers', 'Ongoing training and documentation', '24/7 technical support'] },
      ],
    }),
    detailCta(locale, 'Transform your business operations with autonomous AI agents. Contact us to schedule a consultation and discover how our multi-agent systems can drive efficiency, reduce costs, and unlock new growth opportunities.'),
  ];
}

// ─── AGENTIC AI & MULTI-AGENT SYSTEMS ─────────────────────

function agenticAiBody(locale: 'en' | 'ar'): ContentBlock[] {
  return [
    detailBanner('agentic-ai-banner.jpg', 'Agentic AI & Multi-Agent Systems', 'Autonomous AI agents that work independently and collaboratively to achieve business goals.', 'AI-Powered Innovation'),
    section({
      heading: 'Our\nApproach',
      intro: 'Rather than offering single-purpose AI tools, we build integrated, multi-agent ecosystems designed for seamless operation. Our systems feature:',
      columns: [
        { label: 'AI-Powered Innovation', items: ['Goal-driven automation', 'Cross-functional collaboration', 'Autonomous decision-making', 'Scalable architecture'] },
      ],
      borderTop: false,
    }),
    section({
      heading: 'Key\nComponents',
      image: 'image-inner6.png',
    }),
    section({
      heading: 'AI Agents, Agentic AI &\nNeural Networks',
      columns: [
        { label: 'AI Agents', items: ['Specialized, task-specific bots that handle routine and complex functions', 'Lead enrichment and qualification', 'Meeting summarization and action item extraction', 'Document processing and analysis', 'Customer inquiry handling', 'Data entry and validation', 'Report generation', 'Workflow orchestration'] },
        { label: 'Agentic AI', items: ['The autonomous core that enables agents to work independently, think, and make data-driven decisions', 'Independent decision-making capabilities', 'Goal-oriented behavior', 'Adaptive learning from experience', 'Context awareness and understanding', 'Multi-agent coordination', 'Self-monitoring and optimization'] },
        { label: 'Neural Networks & ML', items: ['The underlying technology that allows agents to learn from vast amounts of data', 'Autonomous task execution', 'Dynamic priority management', 'Resource allocation optimization', 'Continuous performance improvement', 'Transparent decision logging'] },
      ],
      borderTop: false,
    }),
    section({
      heading: 'Multi-Agent\nSystem Architecture',
      intro: AGENT_GOAL_TEXT,
      image: 'image-inner7.png',
      columns: [
        { label: 'Task Agents', items: ['Specialized for specific business functions', 'Execute defined workflows', 'Report to orchestrator agents'] },
        { label: 'Orchestrator Agents', items: ['Coordinate multiple task agents', 'Manage workflow dependencies', 'Optimize resource allocation', 'Handle exception management'] },
        { label: 'Learning Agents', items: ['Analyze system performance', 'Identify optimization opportunities', 'Recommend process improvements', 'Update agent behaviors'] },
        { label: 'Communication Agents', items: ['Facilitate inter-agent messaging', 'Translate between systems', 'Manage external integrations', 'Handle API communications'] },
      ],
    }),
    section({
      heading: 'Implementation\nFramework',
      intro: AGENT_GOAL_TEXT,
      image: 'image-inner8.png',
      columns: [
        { label: 'Phase 1: Discovery & Planning', items: ['Identify automation opportunities', 'Map existing processes', 'Define success criteria', 'Design agent architecture'] },
        { label: 'Phase 2: Agent Development', items: ['Build specialized agents', 'Train ML models', 'Configure workflows', 'Implement safety controls'] },
        { label: 'Phase 3: Integration & Testing', items: ['Integrate with existing systems', 'Conduct comprehensive testing', 'Validate decision-making', 'Performance optimization'] },
        { label: 'Phase 4: Deployment', items: ['Staged rollout approach', 'Human-in-the-loop oversight', 'Monitoring and alerting', 'Documentation and training'] },
      ],
    }),
    section({
      heading: 'Use Cases\nby Industry',
      intro: AGENT_GOAL_TEXT,
      image: 'image-inner9.png',
      columns: [
        { label: 'Marketing & Sales', items: ['Lead scoring and qualification', 'Personalized campaign management', 'Customer journey orchestration', 'Sales pipeline optimization'] },
        { label: 'Customer Service', items: ['First-line support automation', 'Ticket routing and prioritization', 'Knowledge base management', 'Escalation handling'] },
        { label: 'Operations', items: ['Inventory management', 'Supply chain coordination', 'Quality control', 'Resource scheduling'] },
        { label: 'Finance', items: ['Invoice processing', 'Expense management', 'Fraud detection', 'Compliance monitoring'] },
      ],
    }),
    section({
      heading: 'Benefits & ROI',
      intro: AGENT_GOAL_TEXT,
      image: 'image-inner2.png',
      columns: [
        { label: 'Efficiency Gains', items: ['60-80% reduction in manual task time', '90%+ accuracy in routine processes', '24/7 operational availability', '50% faster response times'] },
        { label: 'Cost Savings', items: ['Reduced labor costs for repetitive tasks', 'Lower error-related expenses', 'Decreased training requirements', 'Minimized operational overhead'] },
        { label: 'Strategic Advantages', items: ['Scalability without proportional cost increase', 'Data-driven decision-making', 'Competitive differentiation', 'Innovation acceleration'] },
      ],
    }),
    section({
      heading: 'Security &\nGovernance',
      image: 'image-inner10.png',
      columns: [
        { label: 'Data Protection', items: ['End-to-end encryption', 'Access control and authentication', 'Audit logging', 'Privacy compliance (GDPR, CCPA)'] },
        { label: 'Ethical AI Practices', items: ['Bias detection and mitigation', 'Transparent decision-making', 'Human oversight mechanisms', 'Accountability frameworks'] },
        { label: 'Quality Assurance', items: ['Continuous monitoring', 'Performance benchmarking', 'Regular audits', 'Version control and rollback'] },
      ],
    }),
    detailCta(locale, 'Transform your business operations with autonomous AI agents. Contact us to schedule a consultation and discover how our multi-agent systems can drive efficiency, reduce costs, and unlock new growth opportunities.'),
  ];
}

// ─── CONVERSATIONAL & EDGE ANALYTICS ──────────────────────

function conversationalBody(locale: 'en' | 'ar'): ContentBlock[] {
  const edgeText = 'AI-powered conversational agents and real-time edge processing for immediate insights';
  return [
    detailBanner('conversational-banner.png', 'Conversational & Edge Analytics', edgeText, 'AI-Powered Innovation'),
    section({
      heading: 'Overview',
      intro: 'Our conversational and edge analytics solutions enable seamless human-machine interaction, faster decision-making, and intelligent automation across every customer touchpoint. By combining natural language understanding with real-time data processing, we deliver immediate, actionable insights.',
      borderTop: false,
    }),
    section({
      heading: 'AI-Powered Sales Prospecting',
      intro: 'AI agents perform end-to-end prospecting with minimal human input, transforming your sales process:',
      columns: [
        { label: 'Lead Enrichment', items: ['Automatic data gathering from multiple sources', 'Contact information verification', 'Company intelligence aggregation', 'Behavioral data integration', 'Social profile analysis'] },
        { label: 'Personalized Outreach', items: ['Dynamic message customization', 'Multi-channel communication (email, SMS, social)', 'Optimal timing optimization', 'A/B testing automation', 'Response tracking and analysis'] },
        { label: 'Meeting Scheduling', items: ['Calendar integration', 'Automated availability checking', 'Time zone management', 'Reminder automation', 'No-show reduction strategies'] },
        { label: 'Expected Results', items: ['70% reduction in manual prospecting time', '40% increase in qualified lead generation', '50% improvement in meeting booking rates', '3x faster sales cycle'] },
      ],
    }),
    section({
      heading: 'Real-Time Marketing Campaigns',
      intro: 'Using real-time data analysis, our agents create and manage hyper-targeted campaigns across multiple channels, dynamically adapting content and budget based on performance:',
      columns: [
        { label: 'Real-Time Campaign Management', items: ['Multi-channel orchestration (social, search, display, email)', 'Performance monitoring and optimization', 'Budget allocation automation', 'Creative testing and rotation', 'Audience segmentation refinement'] },
        { label: 'Dynamic Content Optimization', items: ['A/B testing automation', 'Personalization at scale', 'Message adaptation based on engagement', 'Visual content optimization', 'Landing page optimization'] },
        { label: 'Performance-Based Adaptation', items: ['Real-time bidding adjustments', 'Channel mix optimization', 'Creative performance tracking', 'Conversion rate optimization', 'ROI maximization'] },
        { label: 'Expected Results', items: ['35% improvement in campaign ROI', '60% reduction in cost per acquisition', '80% increase in personalization at scale', '2-3x faster optimization cycles'] },
      ],
    }),
    section({
      heading: '24/7 Customer Service Agents',
      intro: 'Agentic systems provide 24/7, multi-channel customer service, handling routine inquiries automatically and escalating complex issues to human agents with complete context.',
      columns: [
        { label: 'Intelligent Routing', items: ['Automatic issue categorization', 'Skill-based routing', 'Priority escalation', 'Context preservation', 'Seamless agent handoff'] },
        { label: 'Self-Service Capabilities', items: ['FAQ automation', 'Knowledge base search', 'Guided troubleshooting', 'Account management', 'Order tracking', 'Returns processing'] },
        { label: 'Expected Results', items: ['80% reduction in response time', '60% decrease in support costs', '90% first-contact resolution for routine issues', '40% improvement in customer satisfaction'] },
      ],
    }),
    section({
      heading: 'Autonomous Business Intelligence',
      intro: 'Continuous, autonomous analysis of your business data surfaces insights and anomalies before you have to ask for them.',
      columns: [
        { label: 'Autonomous Data Analysis', items: ['Continuous monitoring of business metrics', 'Pattern recognition and trend identification', 'Correlation analysis', 'Predictive forecasting', 'Scenario modeling'] },
        { label: 'Anomaly Detection', items: ['Real-time alerts for unusual patterns', 'Fraud detection', 'Quality control monitoring', 'Performance deviation tracking', 'Risk identification'] },
        { label: 'Automated Reporting', items: ['Scheduled report generation', 'Custom dashboard creation', 'Executive summaries', 'Trend analysis', 'Actionable recommendations'] },
        { label: 'Decision Support', items: ['What-if scenario analysis', 'Opportunity identification', 'Risk assessment', 'Resource optimization suggestions', 'Performance benchmarking'] },
        { label: 'Expected Results', items: ['90% faster insight generation', '50% reduction in reporting time', '3x improvement in decision speed', '40% better forecast accuracy'] },
      ],
    }),
    section({
      heading: 'Edge Analytics Architecture',
      image: 'image-inner12.png',
      columns: [
        { label: 'Edge Computing Benefits', items: ['Ultra-low latency (100ms)', 'Reduced bandwidth usage', 'Improved data privacy', 'Offline capability', 'Scalable infrastructure'] },
        { label: 'Processing Capabilities', items: ['Stream processing', 'Complex event processing', 'Real-time aggregation', 'Immediate decision-making', 'Local data filtering'] },
      ],
    }),
    section({
      heading: 'Conversational\nAI Technology',
      intro: edgeText,
      image: 'image-inner13.png',
      columns: [
        { label: 'Core Components', items: ['Intent recognition', 'Entity extraction', 'Sentiment analysis', 'Context management', 'Multilingual support'] },
        { label: 'Advanced Features', items: ['Contextual understanding across conversations', 'Emotion detection and response', 'Personality adaptation', 'Learning from interactions', 'Continuous improvement'] },
      ],
    }),
    section({
      heading: 'Integration\nEcosystem',
      intro: edgeText,
      image: 'image-inner14.png',
      columns: [
        { label: 'CRM Systems', items: ['Salesforce', 'HubSpot', 'Microsoft Dynamics', 'Zoho CRM', 'Custom CRM solutions'] },
        { label: 'Communication Platforms', items: ['Slack', 'Microsoft Teams', 'WhatsApp Business', 'Facebook Messenger', 'Instagram Direct'] },
        { label: 'E-Commerce Platforms', items: ['Shopify', 'WooCommerce', 'Magento', 'BigCommerce', 'Custom platforms'] },
      ],
    }),
    section({
      heading: 'Security\n& Compliance',
      intro: edgeText,
      image: 'image-inner15.png',
      columns: [
        { label: 'Data Protection', items: ['End-to-end encryption', 'Secure data storage', 'Access controls', 'Audit logging', 'GDPR/CCPA compliance'] },
        { label: 'Quality Assurance', items: ['Conversation monitoring', 'Accuracy tracking', 'Performance metrics', 'Regular audits', 'Continuous improvement'] },
      ],
    }),
    detailCta(locale, 'Transform your business operations with autonomous AI agents. Contact us to schedule a consultation and discover how our multi-agent systems can drive efficiency, reduce costs, and unlock new growth opportunities.'),
  ];
}

// ─── AUTOMATED DECISION-MAKING & BPA ───────────────────────

function automatedDecisionBody(locale: 'en' | 'ar'): ContentBlock[] {
  return [
    detailBanner('automation-banner-ai.png', 'Automated Decision-Making & BPA', 'Automate Decisions and Compose Workflows to Deliver Measurable Business Value', 'AI-Powered Innovation'),
    section({
      heading: 'Overview',
      intro: 'Automated Decision-Making (ADM) is a transformative practice within Business Process Automation (BPA) that uses AI and machine learning to execute repetitive, rule-based tasks with minimal human intervention. By automating decisions and workflows, businesses can achieve significant efficiency gains, cost reductions, and operational excellence.',
      borderTop: false,
    }),
    section({
      // Literal markup (automated-decision-making-and-BPA.html lines
      // 253-284): heading is lg-6 here (not the default 7), and the single
      // data column is lg-5 (not the default formula's 3) — a label,
      // paragraph and 5-item list all in one column, not 3-4 short columns.
      heading: 'Multi-Decision Pattern (MDP) Framework',
      intro: 'MDP is a sophisticated framework for modeling complex business processes that involve multiple decision points, dependencies, and outcomes.',
      headingSpan: 6,
      columnSpan: 5,
      columns: [
        { label: 'What is MDP?', items: ['Decision Nodes: points where automated decisions are made', 'Process Flows: sequences of activities and their dependencies', 'Business Rules: logic governing decision outcomes', 'Integration Points: connections to external systems', 'Exception Handling: procedures for managing anomalies'] },
      ],
    }),
    section({
      heading: 'Implementation Strategy',
      intro: 'Automate Decisions and Compose Workflows to Deliver Measurable Business Value',
      image: 'automation-banner-ai1.png',
    }),
    section({
      heading: 'Phase 1: Pilot for Fast Impact',
      borderTop: false,
      columns: [
        { label: 'Identify High-Value Use Case', items: ['Repetitive, high-volume processes', 'Clear business rules', 'Measurable impact', 'Limited complexity'] },
        { label: 'Establish Clear KPIs', items: ['Processing time reduction', 'Error rate improvement', 'Cost savings', 'User satisfaction'] },
        { label: 'Create Control/Baseline', items: ['Current state metrics', 'Manual process benchmarks', 'Cost analysis', 'Quality measures'] },
        { label: 'Prove ROI Quickly', items: ['30-60 day implementation', 'Measurable results', 'Stakeholder buy-in', 'Foundation for scaling'] },
      ],
    }),
    section({
      heading: 'Phase 2: No-Code/Low-Code Platforms',
      borderTop: false,
      columns: [
        { label: 'Platform Features', items: ['Visual workflow designers', 'Drag-and-drop interfaces', 'Pre-built templates', 'Integration connectors', 'Testing environments'] },
        { label: 'Role-Based Access Control', items: ['User permissions management', 'Approval workflows', 'Audit trails', 'Version control'] },
        { label: 'Templates for Consistency', items: ['Standardized processes', 'Best practice incorporation', 'Faster deployment', 'Quality assurance'] },
        { label: 'Benefits', items: ['Reduced development time (50-70%)', 'Lower technical barriers', 'Faster iteration', 'Business user empowerment', 'Lower total cost of ownership'] },
      ],
    }),
    section({
      heading: 'Phase 3: Human-in-the-Loop Oversight',
      borderTop: false,
      columns: [
        { label: 'Review Queues', items: ['Exception flagging', 'Edge case management', 'Quality assurance', 'Pattern identification'] },
        { label: 'Override Paths', items: ['Manual intervention capability', 'Expert judgment application', 'Policy compliance', 'Risk mitigation'] },
        { label: 'Audit Trails', items: ['Complete decision history', 'Transparency and accountability', 'Compliance documentation', 'Performance analysis'] },
        { label: 'Trust Building', items: ['Transparent operations', 'Explainable AI', 'Human oversight', 'Continuous monitoring'] },
      ],
    }),
    section({
      heading: 'Phase 4: Continuous Optimization',
      borderTop: false,
      columns: [
        { label: 'A/B Testing Guardrails', items: ['Controlled experiments', 'Performance comparison', 'Statistical significance', 'Risk management'] },
        { label: 'Feedback Signals', items: ['User satisfaction', 'Business outcomes', 'System performance', 'Error patterns'] },
        { label: 'Scheduled Model Retraining', items: ['Drift detection', 'Data freshness', 'Performance maintenance', 'Adaptation to changes'] },
        { label: 'Business Evolution Adaptation', items: ['Market changes', 'Regulatory updates', 'Strategic shifts', 'Technology advances'] },
      ],
    }),
    section({
      heading: 'Phase 5: Secure & Ethical Deployment',
      borderTop: false,
      columns: [
        { label: 'PII Minimization', items: ['Collect only necessary data', 'Data anonymization', 'Retention policies', 'Deletion protocols'] },
        { label: 'Encryption', items: ['Data in transit (TLS/SSL)', 'Data at rest (AES-256)', 'Key management', 'Secure communication'] },
        { label: 'Access Controls', items: ['Role-based permissions', 'Multi-factor authentication', 'Least privilege principle', 'Regular access reviews'] },
        { label: 'Bias & Drift Monitoring', items: ['Fairness metrics', 'Performance disparities', 'Model drift detection', 'Regular audits'] },
      ],
    }),
    section({
      heading: 'Technology\nStack',
      intro: AGENT_GOAL_TEXT,
      image: 'automation-banner-ai2.png',
      columns: [
        { label: 'Decision Engines', items: ['Business rule management systems (BRMS)', 'Machine learning models', 'Predictive analytics', 'Optimization algorithms'] },
        { label: 'Workflow Automation', items: ['Process orchestration platforms', 'Integration tools (iPaaS)', 'RPA (Robotic Process Automation)', 'API management'] },
        { label: 'Monitoring & Analytics', items: ['Real-time dashboards', 'Performance metrics', 'Exception tracking', 'Continuous improvement analytics'] },
      ],
    }),
    section({
      heading: 'Risk\nManagement',
      intro: AGENT_GOAL_TEXT,
      image: 'image-inner2.png',
      columns: [
        { label: 'Technical Risks', items: ['System integration complexity', 'Data quality issues', 'Scalability concerns', 'Security vulnerabilities'] },
        { label: 'Organizational Risks', items: ['Change resistance', 'Skill gaps', 'Process redesign requirements', 'Stakeholder alignment'] },
        { label: 'Mitigation Strategies', items: ['Phased implementation', 'Comprehensive training', 'Change management programs', 'Strong governance', 'Continuous monitoring'] },
      ],
    }),
    section({
      heading: 'Future Trends',
      intro: AGENT_GOAL_TEXT,
      columns: [
        { label: 'Hyper-Automation', items: ['End-to-end process automation', 'AI-powered orchestration', 'Intelligent document processing', 'Advanced analytics integration'] },
        { label: 'Autonomous Systems', items: ['Self-directed workflow optimization', 'Predictive resource allocation', 'Adaptive process redesign'] },
        { label: 'Conversational AI', items: ['Natural language interfaces', 'Voice-activated workflows', 'Intelligent assistance', 'Context-aware automation'] },
      ],
    }),
    detailCta(locale, 'Transform your business operations with autonomous AI agents. Contact us to schedule a consultation and discover how our multi-agent systems can drive efficiency, reduce costs, and unlock new growth opportunities.'),
  ];
}

// ─── POLARIZATION & PRE-INDOCTRINATION ────────────────────

function polarizationBody(locale: 'en' | 'ar'): ContentBlock[] {
  return [
    detailBanner('polarization-banner.jpg', 'Polarization &\nIndoctrination Analysis', 'Understanding Market Segmentation and Consumer Psychology', 'AI-Powered Innovation'),
    section({
      heading: 'Overview',
      intro: 'Polarization and indoctrination describe the tendency of organizations or markets to split into extreme perspectives or inflexible ideologies, often fueled by selective messaging and group dynamics. While polarization can foster loyalty and alignment, it also poses threats to innovation, ethical consideration, and adaptive thinking if not balanced by open dialogue. Understanding and strategically navigating polarization enables businesses to position themselves effectively in divided markets.',
      borderTop: false,
    }),
    section({
      heading: 'Understanding\nMarket Polarization',
      intro: 'Market Polarization occurs when consumer preferences, values, and purchasing behaviors cluster around opposing extremes rather than distributing evenly across a spectrum.',
      image: 'image-inner11.png',
      columns: [
        { label: 'Key Characteristics', items: ['Distinct consumer segments with opposing preferences', 'Strong brand loyalties within segments', 'Limited middle-ground appeal', 'Value-based decision making', 'Identity-driven consumption'] },
        { label: 'Drivers of Polarization', items: ['Increasing income inequality', 'Value-based marketing', 'Social media echo chambers', 'Political and cultural divisions', 'Brand activism and positioning'] },
      ],
    }),
    section({
      heading: '1. Catering to Distinct Consumer Segments',
      intro: 'Segment-Specific Positioning — rather than attempting to appeal to everyone, successful businesses identify and target specific polarized segments:',
      borderTop: false,
      columns: [
        { label: 'Premium/Luxury Segment', items: ['Quality-focused messaging', 'Exclusivity and prestige', 'Heritage and craftsmanship', 'Superior experience', 'Status signaling'] },
        { label: 'Value/Economy Segment', items: ['Price-focused messaging', 'Practical benefits', 'Accessibility', 'Efficiency', 'Smart shopping'] },
        { label: 'Implementation Strategies', items: ['Clear brand positioning', 'Segment-specific product lines', 'Targeted marketing campaigns', 'Channel optimization', 'Pricing strategy differentiation'] },
        { label: 'Expected Outcomes', items: ['40% improvement in message resonance', '35% increase in segment loyalty', '25% reduction in marketing waste', 'Stronger brand identity'] },
      ],
    }),
    section({
      heading: '2. Leveraging Brand Values for Value-Driven Customers',
      intro: 'Values-Based Marketing — modern consumers increasingly make purchasing decisions based on alignment with their values and beliefs.',
      borderTop: false,
      columns: [
        { label: 'Key Value Dimensions', items: ['Social responsibility', 'Political alignment', 'Ethical sourcing', 'Community support', 'Innovation vs. tradition', 'Global vs. local'] },
        { label: 'Strategic Approach', items: ['Authentic positioning: align brand actions with stated values', 'Consistent messaging across all touchpoints', 'Community building for like-minded consumers', 'Transparency through clear reporting', 'Engagement in value-driven initiatives'] },
        { label: 'Value-Driven Campaigns', items: ['Cause marketing', 'Sustainable product lines', 'Social impact partnerships', 'Transparency initiatives', 'Community programs'] },
      ],
    }),
    section({
      heading: '3. Adapting to Price Polarization',
      intro: 'Multi-Tier Strategy Development — price polarization refers to the disappearance of the middle market as consumers gravitate toward either premium or value options:',
      borderTop: false,
      columns: [
        { label: 'Premium Strategy', items: ['Superior quality and materials', 'Enhanced customer service', 'Exclusive experiences', 'Innovation and technology', 'Brand heritage and story'] },
        { label: 'Value Strategy', items: ['Operational efficiency', 'Streamlined offerings', 'Self-service options', 'Volume economics', 'Essential features focus'] },
        { label: 'Mid-Market Challenges', items: ['Caught between premium and value', 'Unclear value proposition', 'Price-quality confusion', 'Limited differentiation', 'Margin pressure'] },
      ],
    }),
    section({
      heading: 'Strategic Responses to Price Polarization',
      borderTop: false,
      columns: [
        { label: 'Option 1: Portfolio Approach', items: ['Maintain multiple brands at different price points', 'Clear brand separation', 'Distinct positioning for each'] },
        { label: 'Option 2: Tiered Offerings', items: ['Good-better-best product hierarchy', 'Clear feature differentiation', 'Upgrade paths', 'Bundle options'] },
        { label: 'Option 3: Segment Selection', items: ['Choose premium or value positioning', 'Exit the middle market', 'Focus resources on chosen segment', 'Optimize for target customer'] },
      ],
    }),
    section({
      heading: 'Polarization in Digital Marketing',
      intro: AGENT_GOAL_TEXT,
      image: 'image-inner10.png',
      columns: [
        { label: 'Understanding Digital Polarization', items: ['Algorithm-driven content filtering', 'Self-selecting communities', 'Confirmation bias reinforcement', 'Rapid opinion spreading', 'Viral amplification of extreme views'] },
        { label: 'Marketing Implications', items: ['Segment-specific platforms', 'Influencer selection', 'Content polarization', 'Community management', 'Controversy navigation'] },
        { label: 'Best Practices', items: ['Authentic engagement', 'Transparent communication', 'Respectful dialogue', 'Value consistency', 'Crisis preparedness'] },
      ],
    }),
    section({
      heading: 'Risks &\nConsiderations',
      intro: AGENT_GOAL_TEXT,
      image: 'image-inner1.png',
      columns: [
        { label: 'Brand Risk', items: ['Alienating potential customers', 'Controversial positioning', 'Boycott vulnerability', 'Reputation damage', 'Market limitation'] },
        { label: 'Operational Challenges', items: ['Complex inventory management', 'Marketing efficiency', 'Channel conflicts', 'Organizational alignment', 'Resource allocation'] },
        { label: 'Risk Management', items: ['Thorough market research', 'Scenario planning', 'Stakeholder analysis', 'Crisis communication plans', 'Flexibility in positioning'] },
        { label: 'Balanced Approach', items: ['Core values with inclusive messaging', 'Multiple touchpoints for different segments', 'Adaptive communication strategies', 'Regular market assessment', 'Feedback integration'] },
      ],
    }),
    section({
      heading: 'Implementation\nFramework',
      intro: AGENT_GOAL_TEXT,
      image: 'image-inner-1.png',
      columns: [
        { label: 'Phase 1: Market Analysis (Week 1-4)', items: ['Identify polarization dimensions', 'Map consumer segments', 'Analyze competitive positioning', 'Assess brand current position', 'Define strategic opportunities'] },
        { label: 'Phase 2: Strategy Development (Week 5-8)', items: ['Select target segments', 'Develop positioning strategy', 'Create messaging frameworks', 'Design product/service offerings', 'Plan channel strategy'] },
        { label: 'Phase 3: Execution Planning (Week 9-12)', items: ['Campaign development', 'Content creation', 'Channel setup', 'Team training', 'Launch preparation'] },
        { label: 'Phase 4: Launch & Monitor (Week 13-16)', items: ['Phased rollout', 'Performance tracking', 'Sentiment monitoring', 'Engagement analysis', 'Quick adjustments'] },
      ],
    }),
    section({
      heading: 'Success Metrics',
      columns: [
        { label: 'Segment Effectiveness', items: ['Segment penetration rate', 'Within-segment market share', 'Customer acquisition by segment', 'Segment profitability', 'Loyalty metrics by segment'] },
        { label: 'Brand Positioning', items: ['Brand perception alignment', 'Value association strength', 'Differentiation scores', 'Recommendation likelihood', 'Brand advocacy'] },
        { label: 'Business Performance', items: ['Revenue by segment', 'Margin by tier', 'Customer lifetime value', 'Market share gains', 'Competitive positioning'] },
      ],
    }),
    section({
      heading: 'Industry Examples',
      columns: [
        { label: 'Fashion & Apparel', items: ['Fast fashion vs. sustainable luxury', 'Athleisure vs. traditional formal', 'Direct-to-consumer vs. traditional retail'] },
        { label: 'Food & Beverage', items: ['Organic/natural vs. conventional', 'Plant-based vs. traditional', 'Local/artisanal vs. mass-produced'] },
        { label: 'Technology', items: ['Open-source vs. proprietary', 'Privacy-focused vs. convenience-first', 'Innovation vs. reliability'] },
        { label: 'Automotive', items: ['Electric vs. traditional', 'Luxury vs. economical', 'Performance vs. practicality'] },
      ],
    }),
    detailCta(locale, 'Navigate market polarization effectively with our data-driven insights and strategic guidance. Our team helps you identify opportunities, develop positioning strategies, and execute campaigns that resonate with your target segments.'),
  ];
}

// ─── BEHAVIORAL INTELLIGENCE ───────────────────────────────

function behavioralBody(locale: 'en' | 'ar'): ContentBlock[] {
  const philosophyText = 'Uniting AI, Data Science, Psychology, and Entrepreneurship';
  return [
    detailBanner('behavioral-banner.png', 'Behavioral Intelligence', philosophyText, 'AI-Powered Innovation'),
    section({
      heading: 'Overview',
      intro: 'Our company represents a unique convergence of artificial intelligence, data science, psychology, and entrepreneurship to form a comprehensive "behavioral intelligence" platform. This integration enables unprecedented understanding of customer behavior, motivations, and decision-making processes.',
      borderTop: false,
    }),
    section({
      heading: 'Core Philosophy',
      intro: 'Behavioral intelligence goes beyond traditional analytics by understanding not just what customers do, but why they do it. By combining psychological insights with AI-powered data analysis, we create solutions that resonate on a human level while delivering measurable business results.',
    }),
    section({
      heading: '1. Psychosocial Dynamic Strategies',
      intro: 'Deep Psychological Profiling: we build comprehensive psychological profiles by identifying emotional cues and behavioral patterns to understand customer motivations, biases, and desires.',
      columns: [
        { label: 'Emotional Cue Recognition', items: ['Sentiment analysis across communications', 'Emotional state detection', 'Mood tracking and prediction', 'Stress and urgency indicators', 'Engagement level assessment'] },
        { label: 'Behavioral Pattern Analysis', items: ['Purchase behavior mapping', 'Decision-making patterns', 'Content consumption habits', 'Interaction preferences', 'Channel affinity analysis'] },
        { label: 'Motivation Understanding', items: ['Core value identification', 'Goal recognition', 'Pain point analysis', 'Aspiration mapping', 'Barrier identification'] },
      ],
    }),
    section({
      heading: '2. Emotionally Resonant Content Creation',
      intro: 'AI-generated marketing messages that tap into specific emotions and psychological triggers:',
      columns: [
        { label: 'Content Types', items: ['Personalized email campaigns', 'Dynamic ad copy', 'Social media messaging', 'Video scripts', 'Interactive experiences'] },
        { label: 'Emotional Targeting', items: ['Joy and excitement', 'Trust and security', 'Achievement and success', 'Belonging and community', 'Relief and solutions'] },
        { label: 'Psychological Frameworks', items: ['Cognitive bias leveraging', 'Emotional appeal optimization', 'Narrative arc development', 'Social proof integration', 'Authority positioning'] },
      ],
    }),
    section({
      heading: '3. Effective Social Proof Deployment',
      intro: 'Strategic influence mechanisms deploy nudges that frame purchase decisions as social norms, encouraging conformity and community participation.',
      columns: [
        { label: 'Social Proof Types', items: ['Customer testimonials', 'User statistics ("X people bought this")', 'Expert endorsements', 'Influencer partnerships', 'Peer reviews and ratings'] },
        { label: 'Implementation Strategies', items: ['Real-time social activity feeds', 'Community engagement showcases', 'User-generated content integration', 'Social validation triggers', 'Collective behavior indicators'] },
      ],
    }),
    section({
      heading: '4. Scarcity and Loss Aversion Tactics',
      intro: 'Ethical urgency creation: create genuine urgency through limited availability while maintaining customer trust.',
      columns: [
        { label: 'Scarcity Mechanisms', items: ['Limited-time offers', 'Inventory alerts', 'Exclusive access', 'Early-bird pricing', 'Limited editions'] },
        { label: 'Loss Aversion Triggers', items: ['Countdown timers', 'Stock level indicators', 'Expiring benefits', 'Comparison to missed opportunities', 'Future price increases'] },
        { label: 'Best Practices', items: ['Transparent communication', 'Genuine scarcity (no false urgency)', 'Clear value proposition', 'Easy decision-making', 'Trust maintenance'] },
      ],
    }),
    section({
      heading: '5. Hyper-Personalized Touchpoints',
      intro: 'Unified Customer Data Platform (CDP) integration delivers seamless, relevant, and context-aware experiences across all channels:',
      columns: [
        { label: 'Dynamic Pricing', items: ['Real-time price personalization', 'Behavior-based discounts', 'Willingness-to-pay optimization', 'Historical purchase analysis', 'Competitive positioning'] },
        { label: 'Predictive Recommendations', items: ['Need anticipation', 'Product suggestions', 'Content recommendations', 'Service offerings', 'Timing optimization'] },
        { label: 'AI-Driven Conversations', items: ['Emotional state adaptation', 'Personality matching', 'Context preservation', 'Personalized support', 'Empathetic responses'] },
      ],
    }),
    section({
      heading: '6. Proactive Churn Management',
      intro: 'Early warning and intervention systems catch at-risk customers before they leave.',
      columns: [
        { label: 'Behavioral Change Detection', items: ['Engagement drop identification', 'Purchase pattern shifts', 'Communication frequency changes', 'Website activity reduction', 'Support interaction increases'] },
        { label: 'Automated Retention Campaigns', items: ['Risk-level segmentation', 'Personalized win-back offers', 'Pain point addressing', 'Value reinforcement', 'Re-engagement strategies'] },
        { label: 'Intervention Tactics', items: ['Proactive outreach', 'Special offers', 'Product usage tips', 'Success story sharing', 'Community re-engagement'] },
      ],
    }),
    section({
      heading: 'Implementation\nFramework',
      image: 'image-inner1.png',
      columns: [
        { label: 'Phase 1: Behavioral Baseline (Week 1-4)', items: ['Customer data aggregation', 'Behavioral pattern identification', 'Psychological profile development', 'Segment creation', 'Baseline metrics establishment'] },
        { label: 'Phase 2: Strategy Development (Week 5-8)', items: ['Personalization strategy design', 'Content framework creation', 'Channel strategy optimization', 'Automation workflow design', 'Success metrics definition'] },
        { label: 'Phase 3: Technology Integration (Week 9-12)', items: ['CDP implementation', 'AI model deployment', 'Integration with existing systems', 'Automation setup', 'Testing and validation'] },
        { label: 'Phase 4: Campaign Launch (Week 13-16)', items: ['Phased rollout', 'Performance monitoring', 'A/B testing', 'Optimization cycles', 'Reporting and analysis'] },
        { label: 'Phase 5: Continuous Optimization', items: ['Performance tracking', 'Model refinement', 'Strategy adjustment', 'Expansion to new segments', 'ROI optimization'] },
      ],
    }),
    section({
      heading: 'Industry\nApplications',
      intro: philosophyText,
      image: 'image-inner9.png',
      columns: [
        { label: 'Retail & E-Commerce', items: ['Personalized shopping experiences', 'Dynamic product recommendations', 'Abandoned cart recovery', 'Loyalty program optimization'] },
        { label: 'SaaS & Technology', items: ['User onboarding optimization', 'Feature adoption acceleration', 'Upgrade path personalization', 'Churn prevention'] },
        { label: 'Financial Services', items: ['Product recommendation', 'Investment personalization', 'Fraud detection', 'Customer support optimization'] },
        { label: 'Healthcare', items: ['Patient engagement', 'Treatment adherence', 'Preventive care promotion', 'Satisfaction improvement'] },
      ],
    }),
    section({
      heading: 'Competitive\nAdvantages',
      intro: philosophyText,
      image: 'image-inner6.png',
      columns: [
        { label: 'Data-Driven Insights', items: ['Individual-level customization', 'Automated implementation', 'Cross-channel consistency', 'Efficient resource use'] },
        { label: 'Personalization at Scale', items: ['Individual-level customization', 'Automated implementation', 'Cross-channel consistency', 'Efficient resource use'] },
        { label: 'Strategic Positioning', items: ['Differentiation from competitors', 'Customer loyalty building', 'Market leadership', 'Innovation capability'] },
      ],
    }),
    detailCta(locale, 'Transform your customer relationships with behavioral intelligence. Our ethical, AI-powered approach delivers exceptional experiences while driving measurable business results.'),
  ];
}

// ─── DIGITAL MEDIA & SEARCH ENGINE ─────────────────────────
// digital-media.html and search-engine.html are shaped differently from the
// other 6 detail pages: no page-header eyebrow/columns, just long-form
// prose (`.tt-text-reveal` paragraphs), one or two inline images, and a
// "Let's Work Together" round-CTA (tt-heading-xxxlg, not the standard
// "Ready to Launch Your Project?" copy) — so these use the generic
// heading/paragraph/image blocks (same choice about.html's prose body
// already made) rather than content-section.

function proseCta(locale: 'en' | 'ar', title: string): ContentBlock {
  return {
    type: 'custom',
    component: 'round-cta',
    props: {
      eyebrow: 'Contact',
      title,
      buttonText: "Let's\nConnect!",
      buttonUrl: `/${locale}/contact`,
    },
  };
}

function digitalMediaBody(locale: 'en' | 'ar'): ContentBlock[] {
  return [
    detailBanner('new-image8.jpg', 'Digital Media', undefined, 'Content Planning'),
    paragraph('"Social media Expert" does not mean that you have a Facebook or Instagram account, even if you know exactly how to post a tweet or send a snap, this does not qualify you to work in the social media field.'),
    paragraph('There are so many layers to this business, that normal social media users don’t know that they even exist.'),
    paragraph('Do you know what is social media funnel? A pipeline? How to convert a user from a mere viewer into a brand advocate? So, what is a brand advocate?'),
    paragraph('What is Social media listening? No, it doesn’t concern any kind of music.'),
    { type: 'image', src: '/al-ai-pages/service24.jpg', alt: 'Digital media', layout: 'wide' },
    paragraph('You don’t have to learn or know all this because we do — we run social accounts on all platforms, we generate reports and insights and work upon them to deliver the maximum results to our clients.'),
    paragraph('Social media is the battleground for brands, yet many marketers struggle to understand how social media trends and practices can influence growth and sales for their businesses.'),
    paragraph('Every social platform has different types of engagement and conversions. Understanding that with the right strategy, tools and software made our clients stand out from the crowd.'),
    paragraph('We know this became a common practice that anyone can offer, but with us it’s different: our role is not limited to content dispatching and moderation. We believe it should be more about creating efficient pipelines to motivate people to shift from one phase to the other based on their mindsets, profiles, engagements, and demographics.'),
    heading('Online Campaign', 2),
    paragraph('You see them everywhere on the internet — on Facebook, Instagram, Twitter, and Google — and you take them for granted, as something you’re used to seeing daily.'),
    paragraph('These are the online campaigns: they are there to promote a business, a product or a website, and they take a lot of work, effort and professional knowledge to get online.'),
    paragraph('Effective campaigns need intensive planning, stunning visuals, and an intuitive presence — the end result is a solid strategy based on data and insights, where we begin.'),
    paragraph('Our role is to create the right message to the right audience at the right time, to deliver the right conversion.'),
    paragraph('Google Display Network (GDN) campaigns are planned, measured, targeted and delivered right, by a professionally certified team.'),
    paragraph('Choosing the right platform is also determined by all of the above — our process of understanding usually has three sides: your objectives, market insights, and user behavior.'),
    paragraph('Combining all of that and more will enrich your business and marketing activities.'),
    boldParagraph('We love to be challenged.'),
    proseCta(locale, "Let's Work\nTogether"),
  ];
}

function searchEngineBody(locale: 'en' | 'ar'): ContentBlock[] {
  return [
    detailBanner('bg-color7.jpg', 'Search Engine', undefined, 'SEO - Paid Advertising'),
    paragraph('SEM (Search Engine Marketing) is the form of internet marketing that involves the promotion of websites by increasing their visibility in search engine results pages (SERPs) primarily through paid advertising — that is the main difference between SEM and SEO.'),
    paragraph('It is an advertising campaign that targets the behavior of the target when searching for a service or product using the search engine, targeting specific words or phrases so that the advertisement text appears when the search is performed using those words.'),
    paragraph('The process of selecting these words is proportional to the monthly search volume and words related to the nature of the customer’s work, whether it is a service or product. These campaigns are considered among the most highly interactive search engine campaigns due to the need of the user.'),
    paragraph('So, it’s all about search engines — we all strive to win their love and get on top of their search results. We are Google Partners and we earned the badge since we have the expertise and resources to conduct successful campaigns that increase your visibility and drive traffic to your website.'),
    paragraph('We are not an advertising agency, and our expertise is not limited to getting the best CPC or CTR — we look at the user’s journey, behavior and experience to ensure the highest engagement and ROI. Add to that the tracking and monitoring modules, practices and software we use, which improve any type of campaign to deliver higher performance and tangible results (conversion). Having a partnership with Google, and working globally with clients with different needs and objectives, has earned us the merit to say we are now among the best in the region.'),
    { type: 'image', src: '/al-ai-pages/service17.png', alt: 'Search engine marketing', layout: 'wide' },
    paragraph('Search engine optimization (SEO) is a smart investment, and one of the most important digital services — it enables us to control the results page on search engines by configuring sites in terms of design and content, in a scientific manner studied by a technical team of qualified experts, so these sites become search-engine-friendly and get listed on their servers, putting the site at the top of the search engine results page (SERP).'),
    boldParagraph('Yes, we will surely SERP you!'),
    paragraph('With us, SEO is a sustained investment that will give the client’s business a higher reach and ranking at a lower cost, with onsite and offsite optimization and adaptation to the organic search engines’ algorithms.'),
    paragraph('The natural (organic) results usually have a greater impact on your brand, and for users they are more trustworthy — people who use search already have the need, and all you must do is be there.'),
    paragraph('Whether it’s for your website (mobile and desktop) or app, customized by language or location, we are here to help — our SEO department and copywriting teams, along with qualified resources, deliver solid SEO solutions.'),
    paragraph('Search engines will love your content, and you will be on the top search results.'),
    proseCta(locale, "Let's Work\nTogether"),
  ];
}

// ─── CONTACT ────────────────────────────────────────────────
// contact.html's two-column layout — the big-arrow "Let's Talk"/Details/
// Social column beside the numbered "What's your name?"/"What's your
// email?"/topic-dropdown/message form — now has its own literal-markup
// custom block (components/site/blocks/contact-section.tsx), replacing the
// generic `contact-form` + `html` approximation this used to build. That
// approximation rendered as plain labelled inputs in a rounded box, nothing
// like production; see contact-section.tsx's header comment for the full
// reasoning.
function contactBody(locale: 'en' | 'ar'): ContentBlock[] {
  return [
    // contact.html's real header is the `ph-full.ph-center` full-viewport
    // variant, not detailBanner()'s `ph-cap-lg` shape — see
    // page-header-full.tsx. Using the wrong variant here is why the banner
    // didn't align with the tt-wrap content below it.
    {
      type: 'custom',
      component: 'page-header-full',
      props: {
        image: '/al-ai-pages/service16.jpg',
        subtitle: "Let's Work Together",
        title: 'Contact Us',
        description: "Feeling good about a new project?\nWrite us and let's talk about it.",
      },
    },
    {
      type: 'custom',
      component: 'contact-section',
      props: {
        locale,
        talkTitle: "Let's Talk",
        talkText:
          "You're just one click away from taking your brand or product from great to incredible. Fill out the form to share more details about your project.",
        details: {
          address: 'Amman Jordan - Dabouq',
          addressUrl: 'https://maps.google.com/?q=Amman+Jordan+Dabouq',
          phone: '+(962) 659 31 029',
          phoneHref: 'tel:+96265931029',
          email: 'info@al-ai.ai',
        },
        socials: [
          { platform: 'facebook', url: 'https://www.facebook.com/newaeongroup/' },
          { platform: 'instagram', url: 'https://www.instagram.com/newaeongroup/' },
          { platform: 'linkedin', url: 'https://www.linkedin.com/company/new-aeon-digital' },
          { platform: 'youtube', url: 'https://www.youtube.com/@newaeongroup8328' },
          { platform: 'x', url: 'https://x.com/newaeongroup' },
        ],
        formOptions: ['Say Hello', 'New Project', 'Feedback', 'Other'],
      },
    },
  ];
}

// ─── WRITE ────────────────────────────────────────────────

interface PageSpec {
  slug: string;
  title: string;
  excerpt: string;
  metaTitle: string;
  build: (locale: 'en' | 'ar') => ContentBlock[];
}

const PAGES: PageSpec[] = [
  {
    slug: 'home',
    title: 'al-ai.ai',
    excerpt: 'The company focuses its efforts on the crucial pre-processing stage to ensure data is clean, normalized, and optimized for AI applications.',
    metaTitle: 'al-ai.ai | Home',
    build: homeBody,
  },
  {
    slug: 'about',
    title: 'Who We Are?',
    excerpt: 'A forward-thinking company that leverages artificial intelligence to automate tasks, improve operational efficiency, and drive smarter business decisions.',
    metaTitle: 'al-ai.ai | About Us',
    build: aboutBody,
  },
  {
    slug: 'services',
    title: 'Services',
    excerpt: 'We combine digital marketing, data science, and machine learning to drive results through intelligent analysis and automation.',
    metaTitle: 'al-ai.ai | Services',
    build: servicesBody,
  },
  {
    slug: 'data-driven',
    title: 'Data-Driven & Solutions',
    excerpt: 'We focus our efforts on the crucial pre-processing stage to ensure data is clean, normalized, and optimized for AI applications.',
    metaTitle: 'al-ai.ai | Data-Driven Solutions',
    build: dataDrivenBody,
  },
  {
    slug: 'agentic-ai-and-multi-agent-systems',
    title: 'Agentic AI & Multi-Agent Systems',
    excerpt: 'Autonomous AI agents that work independently and collaboratively to achieve business goals.',
    metaTitle: 'al-ai.ai | Agentic AI & Multi-Agent Systems',
    build: agenticAiBody,
  },
  {
    slug: 'conversational-and-edge-analytics',
    title: 'Conversational & Edge Analytics',
    excerpt: 'AI-powered conversational agents and real-time edge processing for immediate insights.',
    metaTitle: 'al-ai.ai | Conversational & Edge Analytics',
    build: conversationalBody,
  },
  {
    slug: 'automated-decision-making-and-bpa',
    title: 'Automated Decision-Making & BPA',
    excerpt: 'Automate decisions and compose workflows to deliver measurable business value.',
    metaTitle: 'al-ai.ai | Automated Decision-Making & BPA',
    build: automatedDecisionBody,
  },
  {
    slug: 'polarization-and-pre-indoctrination',
    title: 'Polarization & Indoctrination Analysis',
    excerpt: 'Understanding market segmentation and consumer psychology.',
    metaTitle: 'al-ai.ai | Polarization & Indoctrination Analysis',
    build: polarizationBody,
  },
  {
    slug: 'behavioral-intelligence',
    title: 'Behavioral Intelligence',
    excerpt: 'Uniting AI, Data Science, Psychology, and Entrepreneurship.',
    metaTitle: 'al-ai.ai | Behavioral Intelligence',
    build: behavioralBody,
  },
  {
    slug: 'digital-media',
    title: 'Digital Media',
    excerpt: 'Professional social media management and digital campaign expertise.',
    metaTitle: 'al-ai.ai | Digital Media',
    build: digitalMediaBody,
  },
  {
    slug: 'search-engine',
    title: 'Search Engine',
    excerpt: 'SEM and SEO services to increase visibility and drive traffic.',
    metaTitle: 'al-ai.ai | Search Engine Marketing',
    build: searchEngineBody,
  },
  {
    slug: 'contact',
    title: 'Contact Us',
    excerpt: "Feeling good about a new project? Write us and let's talk about it.",
    metaTitle: 'al-ai.ai | Contact Us',
    build: contactBody,
  },
];

async function writePages(authorId: string | null) {
  const [pageType] = await db
    .select({ id: contentTypes.id })
    .from(contentTypes)
    .where(eq(contentTypes.slug, 'page'))
    .limit(1);

  if (!pageType) throw new Error('The built-in `page` content type is missing.');

  for (const spec of PAGES) {
    // English text placeholder in both locales for now (per pilot decision) —
    // real Arabic translation replaces this later via the admin editor.
    const enBlocks = spec.build('en');
    const arBlocks = spec.build('ar');

    if (DRY_RUN) {
      report.pages.push({ slug: spec.slug, blocks: { en: enBlocks.length, ar: arBlocks.length }, action: 'created' });
      continue;
    }

    const [existing] = await db
      .select({ id: content.id })
      .from(content)
      .where(and(eq(content.typeId, pageType.id), eq(content.slug, spec.slug)))
      .limit(1);

    let contentId: string;
    if (existing) {
      contentId = existing.id;
      await db.update(content).set({ status: 'published', updatedAt: new Date() }).where(eq(content.id, contentId));
    } else {
      const [created] = await db
        .insert(content)
        .values({ typeId: pageType.id, slug: spec.slug, authorId, status: 'published', publishedAt: new Date() })
        .returning({ id: content.id });
      contentId = created!.id;
    }

    for (const locale of ['en', 'ar'] as const) {
      const blocks = locale === 'en' ? enBlocks : arBlocks;
      await db
        .insert(contentI18n)
        .values({
          contentId,
          locale,
          title: spec.title,
          excerpt: spec.excerpt,
          body: blocks,
          metaTitle: spec.metaTitle,
          noIndex: false,
        })
        .onConflictDoUpdate({
          target: [contentI18n.contentId, contentI18n.locale],
          set: { title: spec.title, excerpt: spec.excerpt, body: blocks, metaTitle: spec.metaTitle },
        });
    }

    report.pages.push({
      slug: spec.slug,
      blocks: { en: enBlocks.length, ar: arBlocks.length },
      action: existing ? 'updated' : 'created',
    });
  }
}

/** about.html replaces the legacy who-we-are page — archive it, don't delete it. */
async function archiveLegacyWhoWeAre() {
  if (DRY_RUN) {
    report.archived.push('who-we-are (dry run)');
    return;
  }

  const [row] = await db
    .select({ id: content.id, status: content.status })
    .from(content)
    .where(eq(content.slug, 'who-we-are'))
    .limit(1);

  if (!row) {
    report.warnings.push('who-we-are: no existing row — nothing to archive.');
    return;
  }
  if (row.status === 'archived') {
    report.warnings.push('who-we-are: already archived.');
    return;
  }

  await db.update(content).set({ status: 'archived', updatedAt: new Date() }).where(eq(content.id, row.id));
  report.archived.push('who-we-are');
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN — nothing will be written ===\n' : `=== SEEDING al-ai.ai PAGES (${PAGES.length} pages) ===\n`);

  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.role, 'admin')).limit(1);
  if (!admin) report.warnings.push('No admin user; pages will have no author.');

  console.log('1. Pages');
  await writePages(admin?.id ?? null);
  for (const page of report.pages) {
    console.log(`   ${page.slug.padEnd(10)} ${page.action.padEnd(8)} en:${page.blocks.en} ar:${page.blocks.ar}`);
  }

  console.log('\n2. Archiving legacy who-we-are (replaced by about)');
  await archiveLegacyWhoWeAre();
  console.log(`   ${report.archived.join(', ') || '(none)'}`);

  if (report.warnings.length) {
    console.log('\nWarnings:');
    for (const w of report.warnings) console.log(`   ! ${w}`);
  }

  console.log(`\n${DRY_RUN ? 'Dry run complete.' : 'Done.'} Check /en/{home,about,services,data-driven,agentic-ai-and-multi-agent-systems,conversational-and-edge-analytics,automated-decision-making-and-bpa,polarization-and-pre-indoctrination,behavioral-intelligence,digital-media,search-engine,contact} (and /ar/... ) once the dev server is running.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
