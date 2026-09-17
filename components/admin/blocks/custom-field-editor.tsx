// components/admin/blocks/custom-field-editor.tsx
'use client';

import { Plus, Trash2 } from 'lucide-react';
import { MediaField } from '../media-field';
import type { CustomFieldSchema } from '@/lib/blocks/custom-schemas';

/**
 * Renders every field a `custom` block's schema declares, against that
 * block's props object. Backs CustomEditor's schema-driven form
 * (grid-editors.tsx) — the alternative to hand-editing raw JSON that a
 * component with an entry in lib/blocks/custom-schemas.ts now gets.
 */
export function CustomSchemaForm({
  schema,
  props,
  onChange,
}: {
  schema: CustomFieldSchema[];
  props: Record<string, unknown>;
  onChange: (props: Record<string, unknown>) => void;
}) {
  const setField = (key: string, value: unknown) => onChange({ ...props, [key]: value });

  return (
    <div className="space-y-4">
      {schema.map((field) => (
        <CustomField
          key={field.key}
          field={field}
          value={props[field.key]}
          onChange={(v) => setField(field.key, v)}
        />
      ))}
    </div>
  );
}

function CustomField({
  field,
  value,
  onChange,
}: {
  field: CustomFieldSchema;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  switch (field.type) {
    case 'text':
      return (
        <label className="block">
          <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">{field.label}</span>
          <input
            type="text"
            className="admin-input py-2 text-sm"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      );

    case 'textarea':
      return (
        <label className="block">
          <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">{field.label}</span>
          <textarea
            rows={3}
            className="admin-input py-2 text-sm resize-y"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      );

    case 'number':
      return (
        <label className="block">
          <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">{field.label}</span>
          <input
            type="number"
            dir="ltr"
            className="admin-input py-2 text-sm"
            value={typeof value === 'number' ? value : ''}
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          />
        </label>
      );

    case 'select':
      return (
        <label className="block">
          <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">{field.label}</span>
          <select
            className="admin-input"
            value={typeof value === 'string' ? value : field.options[0]}
            onChange={(e) => onChange(e.target.value)}
          >
            {field.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      );

    case 'image':
      return (
        <MediaField
          label={field.label}
          value={typeof value === 'string' ? value : ''}
          onChange={onChange}
          testId={`custom-field-${field.key}`}
        />
      );

    case 'string-list': {
      const items = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div>
          <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">{field.label}</span>
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <textarea
                  rows={2}
                  className="admin-input flex-1 py-2 text-sm resize-y"
                  placeholder={`${field.itemLabel} ${idx + 1}`}
                  value={item}
                  onChange={(e) => onChange(items.map((it, i) => (i === idx ? e.target.value : it)))}
                />
                <button
                  type="button"
                  onClick={() => onChange(items.filter((_, i) => i !== idx))}
                  aria-label={`Remove ${field.itemLabel} ${idx + 1}`}
                  className="rounded p-2 text-[var(--admin-danger)] hover:bg-red-500/10"
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onChange([...items, ''])}
            className="admin-btn-ghost mt-2 w-full justify-center border border-dashed border-[var(--admin-line)]"
          >
            <Plus size={14} aria-hidden="true" />
            Add {field.itemLabel}
          </button>
        </div>
      );
    }

    case 'object': {
      const obj = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
      const updateSub = (patch: Record<string, unknown>) => onChange({ ...obj, ...patch });

      return (
        <div>
          <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">{field.label}</span>
          <div className="space-y-3 rounded-md border border-[var(--admin-line)] bg-[var(--admin-elevated)] p-3">
            {field.fields.map((sub) => (
              <CustomField
                key={sub.key}
                field={sub}
                value={obj[sub.key]}
                onChange={(v) => updateSub({ [sub.key]: v })}
              />
            ))}
          </div>
        </div>
      );
    }

    case 'object-list': {
      const items = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
      const updateItem = (idx: number, patch: Record<string, unknown>) =>
        onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

      return (
        <div>
          <span className="mb-1 block text-xs text-[var(--admin-text-secondary)]">{field.label}</span>
          <div className="space-y-3">
            {items.map((item, idx) => (
              <div
                key={idx}
                className="space-y-3 rounded-md border border-[var(--admin-line)] bg-[var(--admin-elevated)] p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[var(--admin-text-muted)]">
                    {field.itemLabel} {idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => onChange(items.filter((_, i) => i !== idx))}
                    aria-label={`Remove ${field.itemLabel} ${idx + 1}`}
                    className="rounded p-1.5 text-[var(--admin-danger)] hover:bg-red-500/10"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>

                {field.fields.map((sub) => (
                  <CustomField
                    key={sub.key}
                    field={sub}
                    value={item[sub.key]}
                    onChange={(v) => updateItem(idx, { [sub.key]: v })}
                  />
                ))}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onChange([...items, {}])}
            className="admin-btn-ghost mt-2 w-full justify-center border border-dashed border-[var(--admin-line)]"
          >
            <Plus size={14} aria-hidden="true" />
            Add {field.itemLabel}
          </button>
        </div>
      );
    }

    default:
      return null;
  }
}
