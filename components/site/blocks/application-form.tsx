'use client';

// components/site/blocks/application-form.tsx
//
// The careers and training application forms, including the CV upload.
//
// The legacy site had two of these — /Career and /TraningApply — and the new
// CMS had neither, because the form type enum offered only `contact` and
// `newsletter` and nothing on the public side could upload a file.
//
// The file is validated in the browser AND on the server. The client check is
// there so someone who picks a 40 MB scan is told immediately instead of after
// a long upload; the server check is the one that counts, because a browser
// check is a courtesy and not a control.
import { useId, useRef, useState } from 'react';
import { Loader2, Paperclip, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Mirrors lib/forms/uploads.ts. Kept in step by tests/forms/uploads.test.ts. */
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
].join(',');

interface Position {
  slug: string;
  title: string;
}

interface Props {
  kind: 'career' | 'training';
  locale: 'ar' | 'en';
  pageSlug?: string;
  title?: string;
  text?: string;
  positions: Position[];
  submitLabel?: string;
  successMessage?: string;
  attachmentRequired: boolean;
}

const COPY = {
  ar: {
    name: 'الاسم الكامل',
    email: 'البريد الإلكتروني',
    phone: 'رقم الهاتف',
    position: 'الوظيفة المتقدَّم لها',
    course: 'الدورة التدريبية',
    choose: 'اختر…',
    message: 'نبذة عنك',
    messageHintCareer: 'أخبرنا لماذا تناسب هذا الدور.',
    messageHintTraining: 'أخبرنا لماذا ترغب في هذا التدريب.',
    attachment: 'السيرة الذاتية',
    attachmentHint: 'PDF أو DOCX أو JPG أو PNG — بحد أقصى ٥ ميجابايت.',
    chooseFile: 'اختر ملفاً',
    removeFile: 'إزالة الملف',
    submit: 'إرسال الطلب',
    sending: 'جارٍ الإرسال…',
    success: 'تم إرسال طلبك. سنتواصل معك قريباً.',
    failure: 'تعذّر إرسال الطلب. حاول مرة أخرى.',
    required: 'هذا الحقل مطلوب.',
    tooLarge: 'حجم الملف أكبر من ٥ ميجابايت.',
    badType: 'نوع الملف غير مدعوم. المسموح: PDF أو DOCX أو JPG أو PNG.',
    fileNeeded: 'أرفق سيرتك الذاتية.',
    badEmail: 'أدخل بريداً إلكترونياً صحيحاً.',
  },
  en: {
    name: 'Full name',
    email: 'Email address',
    phone: 'Phone number',
    position: 'Position applied for',
    course: 'Training course',
    choose: 'Choose…',
    message: 'About you',
    messageHintCareer: 'Tell us why you are a fit for this role.',
    messageHintTraining: 'Tell us why you want this training.',
    attachment: 'CV',
    attachmentHint: 'PDF, DOCX, JPG or PNG — 5 MB maximum.',
    chooseFile: 'Choose a file',
    removeFile: 'Remove file',
    submit: 'Send application',
    sending: 'Sending…',
    success: 'Your application has been sent. We will be in touch.',
    failure: 'The application could not be sent. Please try again.',
    required: 'This field is required.',
    tooLarge: 'That file is larger than 5 MB.',
    badType: 'That file type is not supported. Please send a PDF, DOCX, JPG or PNG.',
    fileNeeded: 'Please attach your CV.',
    badEmail: 'Enter a valid email address.',
  },
} as const;

export function ApplicationForm({
  kind,
  locale,
  pageSlug,
  title,
  text,
  positions,
  submitLabel,
  successMessage,
  attachmentRequired,
}: Props) {
  const t = COPY[locale];
  const formId = useId();
  const fileInput = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [failure, setFailure] = useState<string | null>(null);

  function pickFile(chosen: File | null) {
    setFailure(null);
    if (!chosen) {
      setFile(null);
      setErrors((e) => ({ ...e, attachment: '' }));
      return;
    }
    if (chosen.size > MAX_BYTES) {
      setErrors((e) => ({ ...e, attachment: t.tooLarge }));
      setFile(null);
      // Clear the input too, or the browser keeps showing the rejected
      // filename next to an error saying it was not accepted.
      if (fileInput.current) fileInput.current.value = '';
      return;
    }
    if (!ACCEPT.split(',').includes(chosen.type)) {
      setErrors((e) => ({ ...e, attachment: t.badType }));
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      return;
    }
    setErrors((e) => ({ ...e, attachment: '' }));
    setFile(chosen);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure(null);

    const form = new FormData(event.currentTarget);
    const fields: Record<string, string> = {};
    for (const [key, value] of form.entries()) {
      // The file rides separately, and the honeypot is read below.
      if (typeof value !== 'string') continue;
      if (key === 'website') continue;
      if (value.trim()) fields[key] = value.trim();
    }

    const next: Record<string, string> = {};
    if (!fields.name) next.name = t.required;
    if (!fields.email) next.email = t.required;
    // Deliberately loose. Anything stricter rejects valid addresses, and the
    // real check is whether the reply arrives.
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fields.email)) next.email = t.badEmail;
    if (attachmentRequired && !file) next.attachment = t.fileNeeded;

    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }
    setErrors({});
    setState('sending');

    const payload = new FormData();
    payload.set(
      'data',
      JSON.stringify({
        kind,
        pageSlug,
        locale,
        website: String(form.get('website') ?? ''),
        fields,
      })
    );
    if (file) payload.append('attachments', file);

    try {
      const response = await fetch('/api/forms/apply', {
        method: 'POST',
        // same-origin so the endpoint's own origin check passes; there are no
        // credentials to send on a public form.
        credentials: 'same-origin',
        body: payload,
      });
      const json = (await response.json()) as {
        success: boolean;
        error?: { message?: string };
      };

      if (!response.ok || !json.success) {
        // The server's message is shown when it has one — it is the only place
        // that knows a file failed its magic-byte check, or that the rate limit
        // has been hit.
        setFailure(json.error?.message || t.failure);
        setState('idle');
        return;
      }
      setState('sent');
    } catch {
      setFailure(t.failure);
      setState('idle');
    }
  }

  if (state === 'sent') {
    return (
      <section className="py-16" data-test-id="application-form-sent">
        <div
          className="mx-auto max-w-xl rounded-xl border border-site-success/30 bg-site-success/10 p-8 text-center"
          // A status region, so the confirmation is announced rather than only
          // shown — the form the user was in has just been replaced.
          role="status"
        >
          <p className="text-lg font-medium text-site-ink">{successMessage || t.success}</p>
        </div>
      </section>
    );
  }

  const positionLabel = kind === 'training' ? t.course : t.position;

  return (
    <section className="py-16" data-test-id="application-form">
      <div className="mx-auto max-w-xl px-4">
        {title && (
          <h2 className="font-display mb-3 text-center text-3xl font-bold text-site-ink">
            {title}
          </h2>
        )}
        {text && <p className="mb-8 text-center text-site-ink-muted">{text}</p>}

        <form onSubmit={submit} className="space-y-5" noValidate>
          <Text
            id={`${formId}-name`}
            name="name"
            label={t.name}
            error={errors.name}
            required
            autoComplete="name"
          />
          <Text
            id={`${formId}-email`}
            name="email"
            type="email"
            label={t.email}
            error={errors.email}
            required
            autoComplete="email"
            dir="ltr"
          />
          <Text
            id={`${formId}-phone`}
            name="phone"
            type="tel"
            label={t.phone}
            error={errors.phone}
            autoComplete="tel"
            dir="ltr"
          />

          {/* Only when the editor pointed the block at a content type. With no
              open roles published, a dropdown with one empty option is worse
              than no dropdown. */}
          {positions.length > 0 && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-site-ink">
                {positionLabel}
              </span>
              <select name="position" className="w-full rounded-lg border border-site-line bg-site-surface px-4 py-3 text-site-ink">
                <option value="">{t.choose}</option>
                {positions.map((position) => (
                  <option key={position.slug} value={position.title}>
                    {position.title}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-site-ink">{t.message}</span>
            <textarea
              name="message"
              rows={5}
              className="w-full rounded-lg border border-site-line bg-site-surface px-4 py-3 text-site-ink"
            />
            <span className="mt-1 block text-xs text-site-ink-muted">
              {kind === 'training' ? t.messageHintTraining : t.messageHintCareer}
            </span>
          </label>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-site-ink">
              {t.attachment}
              {attachmentRequired && <span className="text-site-danger"> *</span>}
            </span>

            <input
              ref={fileInput}
              id={`${formId}-file`}
              type="file"
              accept={ACCEPT}
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              className="sr-only"
              aria-describedby={`${formId}-file-hint`}
              aria-invalid={Boolean(errors.attachment) || undefined}
            />

            <div className="flex items-center gap-3">
              <label
                htmlFor={`${formId}-file`}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-site-line px-4 py-2.5 text-sm font-medium text-site-ink transition hover:border-[var(--site-accent)]"
              >
                <Paperclip className="h-4 w-4" />
                {t.chooseFile}
              </label>

              {file && (
                <span className="flex min-w-0 items-center gap-2 text-sm text-site-ink-muted">
                  <span className="truncate" dir="auto">
                    {file.name}
                  </span>
                  <span className="shrink-0 whitespace-nowrap opacity-70">
                    {(file.size / 1024).toFixed(0)} KB
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      pickFile(null);
                      if (fileInput.current) fileInput.current.value = '';
                    }}
                    aria-label={t.removeFile}
                    className="shrink-0 rounded p-0.5 hover:text-site-danger"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </span>
              )}
            </div>

            <span id={`${formId}-file-hint`} className="mt-1.5 block text-xs text-site-ink-muted">
              {t.attachmentHint}
            </span>
            {errors.attachment && (
              <span className="mt-1 block text-xs text-site-danger" role="alert">
                {errors.attachment}
              </span>
            )}
          </div>

          {/*
            Honeypot. Off-screen rather than display:none — some bots skip
            hidden inputs, and a real user never reaches it because it is
            aria-hidden and out of the tab order.
          */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute -left-[9999px] h-0 w-0 opacity-0"
          />

          {failure && (
            <p className="rounded-lg bg-site-danger/10 px-4 py-3 text-sm text-site-danger" role="alert">
              {failure}
            </p>
          )}

          <button
            type="submit"
            disabled={state === 'sending'}
            className={cn(
              'inline-flex w-full items-center justify-center gap-2 rounded-full px-8 py-3.5 font-bold transition',
              'bg-[var(--site-accent)] text-[var(--site-accent-ink)] hover:opacity-90',
              state === 'sending' && 'cursor-wait opacity-70'
            )}
          >
            {state === 'sending' && <Loader2 className="h-4 w-4 animate-spin" />}
            {state === 'sending' ? t.sending : submitLabel || t.submit}
          </button>
        </form>
      </div>
    </section>
  );
}

function Text({
  id,
  name,
  label,
  error,
  required,
  type = 'text',
  autoComplete,
  dir,
}: {
  id: string;
  name: string;
  label: string;
  error?: string;
  required?: boolean;
  type?: string;
  autoComplete?: string;
  dir?: 'ltr';
}) {
  return (
    <label className="block" htmlFor={id}>
      <span className="mb-1.5 block text-sm font-medium text-site-ink">
        {label}
        {required && <span className="text-site-danger"> *</span>}
      </span>
      <input
        id={id}
        name={name}
        type={type}
        dir={dir}
        autoComplete={autoComplete}
        // aria-invalid and a role=alert message, not just a red border: the
        // error has to be reachable by someone who cannot see the colour.
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(
          'w-full rounded-lg border bg-site-surface px-4 py-3 text-site-ink',
          error ? 'border-site-danger' : 'border-site-line'
        )}
      />
      {error && (
        <span id={`${id}-error`} className="mt-1 block text-xs text-site-danger" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
