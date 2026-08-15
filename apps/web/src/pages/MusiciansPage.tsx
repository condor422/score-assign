import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../lib/api';
import { InstrumentRanker } from '../components/InstrumentRanker';
import type { Instrument, Musician } from '../lib/types';

export function MusiciansPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', ranked: [] as string[] });

  const instruments = useQuery({
    queryKey: ['instruments'],
    queryFn: () => api<Instrument[]>('/instruments'),
  });
  const musicians = useQuery({ queryKey: ['musicians'], queryFn: () => api<Musician[]>('/musicians') });

  const add = useMutation({
    mutationFn: () =>
      api<{ id: string }>('/musicians', {
        method: 'POST',
        body: {
          name: form.name,
          email: form.email,
          ...(form.phone ? { phone: form.phone } : {}),
          instruments: form.ranked.map((instrumentId, index) => ({ instrumentId, rank: index + 1 })),
        },
      }),
    onSuccess: () => {
      setForm({ name: '', email: '', phone: '', ranked: [] });
      setOpen(false);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['musicians'] });
      void queryClient.invalidateQueries({ queryKey: ['usage'] });
    },
    onError: (caught) =>
      setError(caught instanceof ApiError ? caught.message : 'Could not add that musician'),
  });

  const nameFor = (id: string): string =>
    instruments.data?.find((i) => i.id === id)?.name ?? 'Unknown';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Musicians</h1>
          <p className="hint">
            Registrations arrive here automatically. Add anyone who signed up on paper.
          </p>
        </div>
        <button className="btn-primary" type="button" onClick={() => setOpen((prev) => !prev)}>
          {open ? 'Cancel' : 'Add musician'}
        </button>
      </div>

      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {open ? (
        <form
          className="card space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            add.mutate();
          }}
        >
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="label" htmlFor="m-name">
                Name
              </label>
              <input
                id="m-name"
                className="input"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="m-email">
                Email
              </label>
              <input
                id="m-email"
                className="input"
                type="email"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="m-phone">
                Phone
              </label>
              <input
                id="m-phone"
                className="input"
                value={form.phone}
                onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <p className="label">Instruments, most preferred first</p>
            <InstrumentRanker
              instruments={instruments.data ?? []}
              value={form.ranked}
              onChange={(ranked) => setForm((prev) => ({ ...prev, ranked }))}
            />
          </div>
          <button
            className="btn-primary"
            type="submit"
            disabled={add.isPending || form.ranked.length === 0}
          >
            Save musician
          </button>
        </form>
      ) : null}

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Name</th>
                <th className="py-2">Contact</th>
                <th className="py-2">Instruments (in order)</th>
                <th className="py-2">Doubling</th>
                <th className="py-2">Experience</th>
              </tr>
            </thead>
            <tbody>
              {musicians.data?.map((musician) => (
                <tr key={musician.id} className="border-t border-slate-100">
                  <td className="py-2">{musician.name}</td>
                  <td className="py-2 text-slate-600">
                    {musician.email}
                    {musician.phone ? <span className="block text-xs">{musician.phone}</span> : null}
                  </td>
                  <td className="py-2">
                    {[...musician.instruments]
                      .sort((a, b) => a.rank - b.rank)
                      .map((preference) => nameFor(preference.instrumentId))
                      .join(' → ')}
                  </td>
                  <td className="py-2">
                    {musician.willingToDouble === null ? '—' : musician.willingToDouble ? 'Yes' : 'No'}
                  </td>
                  <td className="py-2">{musician.experienceLevel ?? '—'}</td>
                </tr>
              ))}
              {musicians.data?.length === 0 ? (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={5}>
                    No musicians yet — share your intake form link.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
