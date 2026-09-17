'use client';

// components/site/blocks/contact-section.tsx
//
// Renders the LITERAL markup from al-ai.ai-pages/contact.html's main
// section — .tt-contact-info (the big diagonal arrow + "Let's Talk" copy +
// Details + Social columns) beside .tt-contact-form (the "What's your
// name?" / "What's your email?" / topic dropdown / message form) — not the
// generic `contact-form` + `html` blocks migration/seed-al-ai-pages.ts's
// contactBody() used before this existed.
//
// That approximation was a deliberate call at the time ("no existing custom
// block for the info column, and building one wasn't worth it for a single
// always-simple page" — see contactBody()'s own comment), but it meant the
// live contact page never matched production: no numbered/labelled
// question style, no big arrow decoration, generic Tailwind input boxes
// instead of theme-black.css's `.tt-form-control`/`.tt-form-creative`
// styling, and none of theme.js's `.tt-anim-fadeinup` reveal. Reported live
// against al-ai.ai/contact.html — the two pages had almost nothing in
// common.
//
// Submission reuses the same POST /api/forms 'contact' flow as
// components/site/blocks/form-blocks.tsx's ContactFormBlock (fields:
// name/email/option/message, same honeypot), so this is a drop-in
// replacement for that block on this one page, not a new form pipeline.
import { useState } from 'react';
import { Loader2 } from 'lucide-react';

interface ContactDetails {
  address: string;
  addressUrl?: string;
  phone: string;
  phoneHref: string;
  email: string;
}

interface SocialLink {
  /** Matches components/site/footer.tsx's SOCIAL_ICONS keys. */
  platform: 'facebook' | 'instagram' | 'linkedin' | 'youtube' | 'x' | 'twitter';
  url: string;
}

interface ContactSectionProps {
  locale: 'ar' | 'en';
  talkTitle: string;
  talkText: string;
  details: ContactDetails;
  socials: SocialLink[];
  /** The topic dropdown's options, in source order. */
  formOptions: string[];
}

const SOCIAL_ICONS: Record<SocialLink['platform'], string> = {
  facebook: 'fa-facebook-f',
  instagram: 'fa-instagram',
  linkedin: 'fa-linkedin',
  youtube: 'fa-youtube',
  twitter: 'fa-x-twitter',
  x: 'fa-x-twitter',
};

const COPY = {
  en: {
    detailsTitle: 'Details',
    socialTitle: 'Social',
    name: "What's your name?",
    namePlaceholder: 'John Smith',
    email: "What's your email?",
    emailPlaceholder: 'john@smith.com',
    topic: 'What would you like to talk about?',
    topicPlaceholder: 'Please choose an option',
    message: 'Your message',
    messagePlaceholder: 'Hello, can you help me with ...',
    submit: 'Send Message',
    sending: 'Sending…',
    sent: 'Thanks — we’ll be in touch shortly.',
    failed: 'Could not send. Please try again.',
  },
  ar: {
    detailsTitle: 'التفاصيل',
    socialTitle: 'تابعنا',
    name: 'ما اسمك؟',
    namePlaceholder: 'جون سميث',
    email: 'ما بريدك الإلكتروني؟',
    emailPlaceholder: 'john@smith.com',
    topic: 'ما الذي تريد التحدث عنه؟',
    topicPlaceholder: 'اختر أحد الخيارات',
    message: 'رسالتك',
    messagePlaceholder: 'مرحباً، هل يمكنكم مساعدتي في ...',
    submit: 'إرسال الرسالة',
    sending: 'جارٍ الإرسال…',
    sent: 'شكراً لك — سنتواصل معك قريباً.',
    failed: 'تعذّر الإرسال. حاول مرة أخرى.',
  },
} as const;

type Status = 'idle' | 'sending' | 'sent' | 'error';

export function ContactSection({
  locale,
  talkTitle,
  talkText,
  details,
  socials,
  formOptions,
}: ContactSectionProps) {
  const t = COPY[locale];
  const [values, setValues] = useState({ name: '', email: '', option: '', message: '' });
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');
    try {
      const res = await fetch('/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          type: 'contact',
          fields: values,
          website,
          locale,
          pageSlug: typeof window !== 'undefined' ? window.location.pathname : undefined,
        }),
      });
      if (!res.ok) throw new Error('failed');
      setStatus('sent');
      setValues({ name: '', email: '', option: '', message: '' });
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="tt-section padding-top-40 padding-bottom-xlg-120">
      <div className="tt-section-inner tt-wrap">
        <div className="tt-row tt-xl-row-reverse">
          <div className="tt-col-xl-5">
            <div className="tt-contact-info margin-bottom-80">
              <div className="tt-big-arrow tt-ba-angle-bottom-left tt-anim-fadeinup">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                  <path d="M13.025 1l-2.847 2.828 6.176 6.176h-16.354v3.992h16.354l-6.176 6.176 2.847 2.828 10.975-11z" />
                </svg>
              </div>

              <div className="tt-contact-info-inner">
                <div className="margin-bottom-50 tt-anim-fadeinup">
                  <h6>{talkTitle}</h6>
                  <p>{talkText}</p>
                </div>

                <div className="tt-contact-details margin-bottom-50 tt-anim-fadeinup">
                  <h6>{t.detailsTitle}</h6>
                  <ul>
                    <li>
                      <span className="tt-cd-icon">
                        <i className="fas fa-map-marker-alt" />
                      </span>
                      {details.addressUrl ? (
                        <a href={details.addressUrl} className="tt-link" target="_blank" rel="noopener">
                          {details.address}
                        </a>
                      ) : (
                        <span className="tt-link">{details.address}</span>
                      )}
                    </li>
                    <li>
                      <span className="tt-cd-icon">
                        <i className="fas fa-phone" />
                      </span>
                      <a href={details.phoneHref} className="tt-link">
                        {details.phone}
                      </a>
                    </li>
                    <li>
                      <span className="tt-cd-icon">
                        <i className="fas fa-envelope" />
                      </span>
                      <a href={`mailto:${details.email}`} className="tt-link">
                        {details.email}
                      </a>
                    </li>
                  </ul>
                </div>

                {socials.length > 0 && (
                  <div className="tt-social-buttons margin-bottom-50 tt-anim-fadeinup">
                    <h6>{t.socialTitle}</h6>
                    <ul>
                      {socials.map((s, idx) => (
                        <li key={idx}>
                          <a href={s.url} className="tt-magnetic-item" target="_blank" rel="noopener">
                            <i className={`fa-brands ${SOCIAL_ICONS[s.platform]}`} />
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="tt-col-xl-7">
            {status === 'sent' ? (
              <p role="status" className="tt-form-control" style={{ border: 'none' }}>
                {t.sent}
              </p>
            ) : (
              <form
                id="tt-contact-form"
                className="tt-form tt-form-creative tt-form-lg"
                onSubmit={handleSubmit}
              >
                {/* Hidden honeypot — bots fill it, humans never see it. */}
                <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                  <label>
                    Website
                    <input
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                    />
                  </label>
                </div>

                <div className="tt-contact-form-inner">
                  <div className="tt-form-group tt-anim-fadeinup">
                    <label>
                      {t.name} <span className="required">*</span>
                    </label>
                    <input
                      className="tt-form-control"
                      type="text"
                      name="name"
                      placeholder={t.namePlaceholder}
                      required
                      value={values.name}
                      onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
                    />
                  </div>

                  <div className="tt-form-group tt-anim-fadeinup">
                    <label>
                      {t.email} <span className="required">*</span>
                    </label>
                    <input
                      className="tt-form-control"
                      type="email"
                      dir="ltr"
                      name="email"
                      placeholder={t.emailPlaceholder}
                      required
                      value={values.email}
                      onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
                    />
                  </div>

                  <div className="tt-form-group tt-anim-fadeinup">
                    <label>
                      {t.topic} <span className="required">*</span>
                    </label>
                    <select
                      className="tt-form-control"
                      name="option"
                      required
                      value={values.option}
                      onChange={(e) => setValues((v) => ({ ...v, option: e.target.value }))}
                    >
                      <option value="" disabled>
                        {t.topicPlaceholder}
                      </option>
                      {formOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="tt-form-group tt-anim-fadeinup">
                    <label>
                      {t.message} <span className="required">*</span>
                    </label>
                    <textarea
                      className="tt-form-control"
                      rows={5}
                      name="message"
                      placeholder={t.messagePlaceholder}
                      required
                      value={values.message}
                      onChange={(e) => setValues((v) => ({ ...v, message: e.target.value }))}
                    />
                  </div>

                  {status === 'error' && (
                    <p role="alert" style={{ color: 'var(--tt-danger, #e5484d)' }}>
                      {t.failed}
                    </p>
                  )}

                  <div className="tt-anim-fadeinup">
                    <button type="submit" className="tt-btn tt-btn-primary tt-magnetic-item" disabled={status === 'sending'}>
                      <span data-hover={status === 'sending' ? t.sending : t.submit}>
                        {status === 'sending' ? t.sending : t.submit}
                      </span>
                      {status === 'sending' && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
