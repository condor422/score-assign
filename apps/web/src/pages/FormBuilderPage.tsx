import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../lib/api';
import { useSession } from '../auth/SessionContext';
import type { FormSummary, PublicFormField } from '../lib/types';

interface FormDefinition {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  status: 'draft' | 'open' | 'closed';
  confirmationMessage: string | null;
  fields: PublicFormField[];
}

const fieldTypeLabels: Record<PublicFormField['type'], string> = {
  text: 'Short text',
  longtext: 'Paragraph',
  email: 'Email',
  phone: 'Phone',
  radio: 'Choose one',
  checkbox: 'Choose many',
  instrument_ranking: 'Rank instruments',
  boolean: 'Yes / no',
};

export function FormBuilderPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { session } = useSession();
  const [draft, setDraft] = useState<FormDefinition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const forms = useQuery({ queryKey: ['forms'], queryFn: () => api<FormSummary[]>('/forms') });
  const formId = forms.data?.[0]?.id ?? null;
  const definition = useQuery({
    queryKey: ['form', formId],
    queryFn: () => api<FormDefinition>(`/forms/${formId}`),
    enabled: Boolean(formId),
  });

  useEffect(() => {
    if (definition.data) setDraft(definition.data);
  }, [definition.data]);

  const save = useMutation({
    mutationFn: (next: FormDefinition) =>
      api<FormDefinition>(`/forms/${next.id}`, {
        method: 'PUT',
        body: {
          title: next.title,
          slug: next.slug,
          description: next.description,
          status: next.status,
          confirmationMessage: next.confirmationMessage,
          fields: next.fields,
        },
      }),
    onSuccess: () => {
      setError(null);
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ['forms'] });
    },
    onError: (caught) => {
      setSaved(false);
      setError(caught instanceof ApiError ? caught.message : 'Could not save the form');
    },
  });

  if (!draft) return <p className="hint">Loading form…</p>;

  const update = (patch: Partial<FormDefinition>): void => {
    setSaved(false);
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const updateField = (index: number, patch: Partial<PublicFormField>): void => {
    setSaved(false);
    setDraft((prev) =>
      prev
        ? { ...prev, fields: prev.fields.map((f, i) => (i === index ? { ...f, ...patch } : f)) }
        : prev,
    );
  };

  const moveField = (index: number, delta: number): void => {
    setSaved(false);
    setDraft((prev) => {
      if (!prev) return prev;
      const next = [...prev.fields];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      const a = next[index]!;
      const b = next[target]!;
      next[index] = b;
      next[target] = a;
      return { ...prev, fields: next.map((field, order) => ({ ...field, order })) };
    });
  };

  const publicUrl = `${window.location.protocol}//${session?.tenant.slug}.${window.location.host.replace(/^[^.]+\./, '')}/register/${draft.slug}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Intake form</h1>
          <p className="hint">Edit the questions your musicians answer, then open the form.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="input w-auto"
            value={draft.status}
            onChange={(e) => update({ status: e.target.value as FormDefinition['status'] })}
          >
            <option value="draft">Draft</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
          <button
            className="btn-primary"
            type="button"
            disabled={save.isPending}
            onClick={() => save.mutate(draft)}
          >
            {save.isPending ? 'Saving…' : 'Save form'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}
      {saved ? (
        <div className="rounded-md border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-800">
          Saved.
        </div>
      ) : null}

      <div className="card space-y-3">
        <div>
          <label className="label" htmlFor="form-title">
            Title
          </label>
          <input
            id="form-title"
            className="input"
            value={draft.title}
            onChange={(e) => update({ title: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="form-desc">
            Description
          </label>
          <textarea
            id="form-desc"
            className="input min-h-20"
            value={draft.description ?? ''}
            onChange={(e) => update({ description: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="form-confirm">
            Confirmation message
          </label>
          <input
            id="form-confirm"
            className="input"
            value={draft.confirmationMessage ?? ''}
            onChange={(e) => update({ confirmationMessage: e.target.value })}
          />
        </div>
        <p className="break-all rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">{publicUrl}</p>
      </div>

      <div className="space-y-3">
        {draft.fields.map((field, index) => (
          <div key={field.key} className="card space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <input
                  className="input font-medium"
                  value={field.label}
                  onChange={(e) => updateField(index, { label: e.target.value })}
                />
                <input
                  className="input mt-2 text-sm"
                  placeholder="Help text (optional)"
                  value={field.helpText ?? ''}
                  onChange={(e) => updateField(index, { helpText: e.target.value })}
                />
              </div>
              <div className="flex flex-col items-end gap-1 text-xs text-slate-500">
                <span className="badge bg-slate-100 text-slate-700">{fieldTypeLabels[field.type]}</span>
                {field.role ? (
                  <span className="badge bg-blue-100 text-blue-800" title="Used by the assignment engine">
                    {field.role}
                  </span>
                ) : null}
                <div className="flex gap-1">
                  <button type="button" className="underline" onClick={() => moveField(index, -1)}>
                    ↑
                  </button>
                  <button type="button" className="underline" onClick={() => moveField(index, 1)}>
                    ↓
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) => updateField(index, { required: e.target.checked })}
                />
                Required
              </label>
              {field.options.length > 0 ? (
                <span className="hint">
                  Options: {field.options.map((option) => option.label).join(', ')}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
