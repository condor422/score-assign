import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api';
import { InstrumentRanker } from '../../components/InstrumentRanker';
import {
  MusicianAttributeFields,
  type MusicianAttributes,
} from '../../components/MusicianAttributeFields';
import { HelpTip } from '../../components/HelpTip';
import type { Difficulty, ExperienceLevel, Instrument, Musician } from '../../lib/types';

interface EditState extends MusicianAttributes {
  name: string;
  email: string;
  phone: string;
  ranked: string[];
  active: boolean;
}

function toEditState(musician: Musician): EditState {
  return {
    name: musician.name,
    email: musician.email ?? '',
    phone: musician.phone ?? '',
    ranked: [...musician.instruments].sort((a, b) => a.rank - b.rank).map((i) => i.instrumentId),
    willingToDouble: musician.willingToDouble,
    experienceLevel: (musician.experienceLevel as ExperienceLevel | null) ?? null,
    difficultyPreference: (musician.difficultyPreference as Difficulty | null) ?? null,
    maxAssignments: musician.maxAssignments,
    active: musician.active,
  };
}

/** Full editing of existing musician records, including the engine's inputs. */
export function MusicianRecordsTab(): JSX.Element {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditState | null>(null);
  const [search, setSearch] = useState('');

  const instruments = useQuery({
    queryKey: ['instruments'],
    queryFn: () => api<Instrument[]>('/instruments'),
  });
  const musicians = useQuery({ queryKey: ['musicians'], queryFn: () => api<Musician[]>('/musicians') });

  const save = useMutation({
    mutationFn: (input: { id: string; state: EditState }) =>
      api(`/musicians/${input.id}`, {
        method: 'PUT',
        body: {
          name: input.state.name,
          email: input.state.email,
          ...(input.state.phone ? { phone: input.state.phone } : {}),
          instruments: input.state.ranked.map((instrumentId, index) => ({
            instrumentId,
            rank: index + 1,
          })),
          willingToDouble: input.state.willingToDouble,
          experienceLevel: input.state.experienceLevel,
          difficultyPreference: input.state.difficultyPreference,
          maxAssignments: input.state.maxAssignments,
          active: input.state.active,
        },
      }),
    onSuccess: () => {
      setEditingId(null);
      setDraft(null);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['musicians'] });
      void queryClient.invalidateQueries({ queryKey: ['roster'] });
    },
    onError: (caught) =>
      setError(caught instanceof ApiError ? caught.message : 'Could not save that musician'),
  });

  const nameFor = (id: string): string =>
    instruments.data?.find((i) => i.id === id)?.name ?? 'Unknown';

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = musicians.data ?? [];
    return term ? list.filter((m) => m.name.toLowerCase().includes(term)) : list;
  }, [musicians.data, search]);

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-md border border-danger/40 bg-danger/5 px-4 py-2 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <div className="card">
        <label className="label" htmlFor="musician-search">
          Find a musician
          <HelpTip topic="contactVisibility" />
        </label>
        <input
          id="musician-search"
          className="input max-w-sm"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Name"
        />
      </div>

      <div className="space-y-3">
        {filtered.map((musician) => {
          const editing = editingId === musician.id && draft !== null;
          return (
            <div className="card space-y-3" key={musician.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-maroon-900">
                    {musician.name}
                    {musician.active ? null : <span className="badge-brand ml-2">Inactive</span>}
                  </p>
                  <p className="hint">
                    {musician.email ?? 'contact withheld'}
                    {musician.phone ? ` · ${musician.phone}` : ''}
                  </p>
                  <p className="hint">
                    {[...musician.instruments]
                      .sort((a, b) => a.rank - b.rank)
                      .map((preference) => nameFor(preference.instrumentId))
                      .join(' → ')}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    if (editing) {
                      setEditingId(null);
                      setDraft(null);
                    } else {
                      setEditingId(musician.id);
                      setDraft(toEditState(musician));
                    }
                  }}
                >
                  {editing ? 'Cancel' : 'Edit'}
                </button>
              </div>

              {editing && draft ? (
                <form
                  className="space-y-4 border-t border-maroon-100 pt-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    save.mutate({ id: musician.id, state: draft });
                  }}
                >
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <label className="label" htmlFor={`edit-name-${musician.id}`}>
                        Name
                      </label>
                      <input
                        id={`edit-name-${musician.id}`}
                        className="input"
                        value={draft.name}
                        onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor={`edit-email-${musician.id}`}>
                        Email
                      </label>
                      <input
                        id={`edit-email-${musician.id}`}
                        className="input"
                        type="email"
                        value={draft.email}
                        onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor={`edit-phone-${musician.id}`}>
                        Phone
                      </label>
                      <input
                        id={`edit-phone-${musician.id}`}
                        className="input"
                        value={draft.phone}
                        onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
                      />
                    </div>
                  </div>

                  <MusicianAttributeFields
                    idPrefix={`edit-${musician.id}`}
                    value={draft}
                    onChange={(next) => setDraft({ ...draft, ...next })}
                  />

                  <div>
                    <p className="label">
                      Instruments, most preferred first
                      <HelpTip topic="instrumentRanking" />
                    </p>
                    <InstrumentRanker
                      instruments={instruments.data ?? []}
                      value={draft.ranked}
                      onChange={(ranked) => setDraft({ ...draft, ranked })}
                    />
                  </div>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.active}
                      onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
                    />
                    Available for assignment
                  </label>

                  <button
                    className="btn-primary"
                    type="submit"
                    disabled={save.isPending || draft.ranked.length === 0}
                  >
                    Save changes
                  </button>
                </form>
              ) : null}
            </div>
          );
        })}
        {filtered.length === 0 ? (
          <p className="card hint">No musicians match that search.</p>
        ) : null}
      </div>
    </div>
  );
}
