// lib/email/templates/form.ts
import 'server-only';
import { layout, esc, row, table, textBlock, type MailLocale } from '../render';
import type { Message } from '../transport';
import type { FormType } from '@/lib/forms/form-types';

export interface FormMailData {
  type: FormType;
  locale: MailLocale;
  fields: Record<string, string>;
  pageSlug?: string | null;
  submittedAt: Date;
}

const T = {
  ar: {
    contactSubject: 'رسالة جديدة من نموذج التواصل',
    newsletterSubject: 'اشتراك جديد في النشرة البريدية',
    careerSubject: 'طلب وظيفة جديد',
    trainingSubject: 'طلب تدريب جديد',
    contactTitle: 'رسالة جديدة',
    newsletterTitle: 'اشتراك جديد',
    careerTitle: 'طلب وظيفة',
    trainingTitle: 'طلب تدريب',
    intro: 'وصل إرسال جديد من الموقع.',
    // Applications carry a CV, and the file is behind the admin login — so the
    // email says a file exists and where to read it, never attaches it.
    attachmentNote: 'المرفقات متوفرة في لوحة التحكم ← النماذج.',
    page: 'الصفحة',
    time: 'الوقت',
    footer: 'إشعار تلقائي من نظام الموقع.',
  },
  en: {
    contactSubject: 'New contact form message',
    newsletterSubject: 'New newsletter signup',
    careerSubject: 'New job application',
    trainingSubject: 'New training application',
    contactTitle: 'New message',
    newsletterTitle: 'New signup',
    careerTitle: 'Job application',
    trainingTitle: 'Training application',
    intro: 'A new submission arrived from the website.',
    attachmentNote: 'Attachments are in the admin panel under Forms.',
    page: 'Page',
    time: 'Time',
    footer: 'Automated notification from the website.',
  },
} as const;

/**
 * Turns a form field key into something readable. Keys arrive as whatever the
 * block editor named them (`full_name`, `phoneNumber`), and the store owner
 * should not have to read snake_case in their inbox.
 */
function humanise(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * A single "someone submitted a form" notification to the store.
 *
 * Every value here is attacker-supplied — this is a public, unauthenticated
 * endpoint — so all of it goes through `esc`. The reply-to is deliberately NOT
 * set from a submitted email field: it is unverified, and honouring it would
 * let anyone direct the store's replies wherever they liked.
 */
export function formAlert(data: FormMailData): Omit<Message, 'to'> {
  const t = T[data.locale];

  /**
   * Subject and heading per form type.
   *
   * This was `isContact ? contactSubject : newsletterSubject`, which sent every
   * job application under the subject "New newsletter signup" the moment the
   * two application types were added — a recruiter filtering their inbox on
   * that subject would never have seen one.
   */
  const SUBJECT: Record<FormType, string> = {
    contact: t.contactSubject,
    newsletter: t.newsletterSubject,
    career: t.careerSubject,
    training: t.trainingSubject,
  };
  const TITLE: Record<FormType, string> = {
    contact: t.contactTitle,
    newsletter: t.newsletterTitle,
    career: t.careerTitle,
    training: t.trainingTitle,
  };

  const subject = SUBJECT[data.type];
  const title = TITLE[data.type];
  const isApplication = data.type === 'career' || data.type === 'training';

  const fieldRows = Object.entries(data.fields)
    .filter(([, value]) => String(value ?? '').trim() !== '')
    .map(([key, value]) =>
      row(humanise(key), esc(value).replace(/\n/g, '<br>'))
    )
    .join('');

  const metaRows = [
    data.pageSlug ? row(t.page, esc(data.pageSlug)) : '',
    row(t.time, esc(data.submittedAt.toISOString().replace('T', ' ').slice(0, 19)), { ltr: true }),
  ].join('');

  return {
    subject,
    html: layout({
      locale: data.locale,
      title,
      intro: isApplication ? `${t.intro} ${t.attachmentNote}` : t.intro,
      body: table(fieldRows + metaRows),
      footer: t.footer,
    }),
    text: textBlock([
      title,
      '',
      ...Object.entries(data.fields).map(([k, v]) => `${humanise(k)}: ${v}`),
      '',
      data.pageSlug ? `${t.page}: ${data.pageSlug}` : null,
      `${t.time}: ${data.submittedAt.toISOString()}`,
    ]),
  };
}
