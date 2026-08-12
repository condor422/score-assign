import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../lib/api';
import type { Instrument, Season, Song } from '../lib/types';

interface Part {
  id: string;
  songId: string;
  songTitle: string;
  instrumentId: string;
  instrumentName: string;
  partNumber: number;
  partLabel: string;
  difficulty: 'easier' | 'moderate' | 'challenging';
  minPlayers: number;
  maxPlayers: number;
}

export function ProgramPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [songTitle, setSongTitle] = useState('');
  const [composer, setComposer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [partForm, setPartForm] = useState({
    songId: '',
    instrumentId: '',
    count: 2,
    difficulty: 'moderate' as Part['difficulty'],
    maxPlayers: 1,
  });

  const seasons = useQuery({ queryKey: ['seasons'], queryFn: () => api<Season[]>('/seasons') });
  const seasonId = seasons.data?.[0]?.id ?? null;
  const instruments = useQuery({
    queryKey: ['instruments'],
    queryFn: () => api<Instrument[]>('/instruments'),
  });
  const songs = useQuery({
    queryKey: ['songs', seasonId],
    queryFn: () => api<Song[]>(`/seasons/${seasonId}/songs`),
    enabled: Boolean(seasonId),
  });
  const parts = useQuery({
    queryKey: ['parts', seasonId],
    queryFn: () => api<Part[]>(`/seasons/${seasonId}/parts`),
    enabled: Boolean(seasonId),
  });

  const fail = (caught: unknown): void =>
    setError(caught instanceof ApiError ? caught.message : 'Something went wrong');

  const addSong = useMutation({
    mutationFn: () =>
      api<{ id: string }>(`/seasons/${seasonId}/songs`, {
        method: 'POST',
        body: { title: songTitle, ...(composer ? { composer } : {}) },
      }),
    onSuccess: () => {
      setSongTitle('');
      setComposer('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['songs', seasonId] });
    },
    onError: fail,
  });

  const addParts = useMutation({
    mutationFn: () =>
      api<{ created: number }>(`/seasons/${seasonId}/parts/bulk`, {
        method: 'POST',
        body: {
          songId: partForm.songId,
          instrumentId: partForm.instrumentId,
          count: partForm.count,
          difficulty: partForm.difficulty,
          maxPlayers: partForm.maxPlayers,
        },
      }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['parts', seasonId] });
      void queryClient.invalidateQueries({ queryKey: ['usage'] });
    },
    onError: fail,
  });

  const removePart = useMutation({
    mutationFn: (partId: string) => api(`/parts/${partId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['parts', seasonId] });
      void queryClient.invalidateQueries({ queryKey: ['usage'] });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Program</h1>
        <p className="hint">
          A part is one instrument line in one song — C Flute 1st, Piccolo 2nd, and so on.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <form
          className="card space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            addSong.mutate();
          }}
        >
          <h2 className="text-sm font-semibold">Add a song</h2>
          <div>
            <label className="label" htmlFor="song-title">
              Title
            </label>
            <input
              id="song-title"
              className="input"
              value={songTitle}
              onChange={(e) => setSongTitle(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="composer">
              Composer or arranger
            </label>
            <input
              id="composer"
              className="input"
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
            />
          </div>
          <button className="btn-primary" type="submit" disabled={addSong.isPending}>
            Add song
          </button>
        </form>

        <form
          className="card space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            addParts.mutate();
          }}
        >
          <h2 className="text-sm font-semibold">Add parts</h2>
          <div>
            <label className="label" htmlFor="part-song">
              Song
            </label>
            <select
              id="part-song"
              className="input"
              value={partForm.songId}
              onChange={(e) => setPartForm((prev) => ({ ...prev, songId: e.target.value }))}
              required
            >
              <option value="">Choose…</option>
              {songs.data?.map((song) => (
                <option key={song.id} value={song.id}>
                  {song.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="part-instrument">
              Instrument
            </label>
            <select
              id="part-instrument"
              className="input"
              value={partForm.instrumentId}
              onChange={(e) => setPartForm((prev) => ({ ...prev, instrumentId: e.target.value }))}
              required
            >
              <option value="">Choose…</option>
              {instruments.data?.map((instrument) => (
                <option key={instrument.id} value={instrument.id}>
                  {instrument.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="label" htmlFor="part-count">
                How many
              </label>
              <input
                id="part-count"
                className="input"
                type="number"
                min={1}
                max={30}
                value={partForm.count}
                onChange={(e) => setPartForm((prev) => ({ ...prev, count: Number(e.target.value) }))}
              />
              <p className="hint">Creates 1st…{partForm.count}</p>
            </div>
            <div>
              <label className="label" htmlFor="part-difficulty">
                Difficulty
              </label>
              <select
                id="part-difficulty"
                className="input"
                value={partForm.difficulty}
                onChange={(e) =>
                  setPartForm((prev) => ({ ...prev, difficulty: e.target.value as Part['difficulty'] }))
                }
              >
                <option value="easier">Easier</option>
                <option value="moderate">Moderate</option>
                <option value="challenging">Challenging</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="part-max">
                Players each
              </label>
              <input
                id="part-max"
                className="input"
                type="number"
                min={1}
                max={50}
                value={partForm.maxPlayers}
                onChange={(e) => setPartForm((prev) => ({ ...prev, maxPlayers: Number(e.target.value) }))}
              />
            </div>
          </div>
          <button className="btn-primary" type="submit" disabled={addParts.isPending}>
            Add parts
          </button>
        </form>
      </div>

      <div className="card">
        <h2 className="mb-2 text-sm font-semibold">Parts ({parts.data?.length ?? 0})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Song</th>
                <th className="py-2">Instrument</th>
                <th className="py-2">Part</th>
                <th className="py-2">Difficulty</th>
                <th className="py-2">Players</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {parts.data?.map((part) => (
                <tr key={part.id} className="border-t border-slate-100">
                  <td className="py-2">{part.songTitle}</td>
                  <td className="py-2">{part.instrumentName}</td>
                  <td className="py-2">{part.partLabel}</td>
                  <td className="py-2">{part.difficulty}</td>
                  <td className="py-2">
                    {part.minPlayers}–{part.maxPlayers}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      className="text-xs text-slate-500 underline"
                      onClick={() => removePart.mutate(part.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {parts.data?.length === 0 ? (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={6}>
                    No parts yet.
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
