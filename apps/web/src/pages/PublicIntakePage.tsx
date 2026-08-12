import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { ApiError, api } from '../lib/api';
import { InstrumentRanker } from '../components/InstrumentRanker';
import type { PublicForm, PublicFormField } from '../lib/types';

type AnswerValue = string | string[] | boolean;

function Field({
  field,
  instruments,
  value,
  onChange,
}: {
  field: PublicFormField;
  instruments: PublicForm['instruments'];
  value: AnswerValue | undefined;
  onChange(next: AnswerValue): void;
}): JSX.Element {
  const id = `field-${field.key}`;

  return (
    <div>
      <label className="label" htmlFor={id}>
        {field.label}
        {field.required ? <span className="text-red-600"> *</span> : null}
      </label>
      {field.helpText ? <p className="hint mb-1">{field.helpText}</p> : null}

      {field.type === 'instrument_ranking' ? (
        <InstrumentRanker
          instruments={instruments}
          value={Array.isArray(value) ? value : []}
          onChange={onChange}
        />
      ) : null}

      {field.type === 'longtext' ? (
        <textarea
          id={id}
          className="input min-h-24"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
        />
      ) : null}

      {field.type === 'text' || field.type === 'email' || field.type === 'phone' ? (
        <input
          id={id}
          className="input"
          type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
        />
      ) : null}

      {field.type === 'radio' ? (
        <div className="space-y-1">
          {field.options.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={field.key}
                value={option.value}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
                required={field.required}
              />
              {option.label}
            </label>
          ))}
        </div>
      ) : null}

      {field.type === 'checkbox' ? (
        <div className="space-y-1">
          {field.options.map((option) => {
            const selected = Array.isArray(value) ? value : [];
            return (
              <label key={option.value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(option.value)}
                  onChange={(e) =>
                    onChange(
                      e.target.checked
                        ? [...selected, option.value]
                        : selected.filter((v) => v !== option.value),
                    )
                  }
                />
                {option.label}
              </label>
            );
          })}
        </div>
      ) : null}

      {field.type === 'boolean' ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          Yes
        </label>
      ) : null}
    </div>
  );
}

export function PublicIntakePage(): JSX.Element {
  const { formSlug = 'registration' } = useParams();
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [done, setDone] = useState<string | null>(null);

  const form = useQuery({
    queryKey: ['public-form', formSlug],
    queryFn: () => api<PublicForm>(`/public/forms/${formSlug}`),
  });

  const submit = useMutation({
    mutationFn: (payload: Record<string, AnswerValue>) =>
      api<{ message: string }>(`/public/forms/${formSlug}/responses`, {
        method: 'POST',
        body: { answers: payload, honeypot: '' },
      }),
    onSuccess: (result) => setDone(result.message),
  });

  if (form.isLoading) {
    return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Loading form…</div>;
  }

  if (form.error) {
    const message = form.error instanceof ApiError ? form.error.message : 'This form is unavailable.';
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <div className="card max-w-md text-center">
          <h1 className="text-lg font-semibold">Registration unavailable</h1>
          <p className="mt-2 text-sm text-slate-600">{message}</p>
        </div>
      </div>
    );
  }

  const data = form.data!;

  if (done) {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <div className="card max-w-md text-center">
          <h1 className="text-lg font-semibold">You are registered</h1>
          <p className="mt-2 text-sm text-slate-600">{done}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <header className="mb-6">
        <p className="text-sm text-slate-500">{data.tenant.name}</p>
        <h1 className="text-2xl font-semibold">{data.form.title}</h1>
        {data.form.description ? (
          <p className="mt-2 text-sm text-slate-600">{data.form.description}</p>
        ) : null}
      </header>

      <form
        className="card space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          submit.mutate(answers);
        }}
      >
        {data.form.fields.map((field) => (
          <Field
            key={field.key}
            field={field}
            instruments={data.instruments}
            value={answers[field.key]}
            onChange={(next) => setAnswers((prev) => ({ ...prev, [field.key]: next }))}
          />
        ))}

        {/* Bots fill hidden inputs; humans never see this one. */}
        <input type="text" name="honeypot" tabIndex={-1} autoComplete="off" className="hidden" />

        {submit.error ? (
          <p className="text-sm text-red-600">
            {submit.error instanceof ApiError ? submit.error.message : 'Could not submit'}
          </p>
        ) : null}

        <button className="btn-primary w-full" type="submit" disabled={submit.isPending}>
          {submit.isPending ? 'Submitting…' : 'Submit registration'}
        </button>
      </form>
    </div>
  );
}
