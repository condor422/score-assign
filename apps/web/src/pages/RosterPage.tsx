import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useSession } from '../auth/SessionContext';
import type { Roster } from '../lib/types';

const confirmationStyles: Record<string, string> = {
  accepted: 'badge bg-green-100 text-green-800',
  declined: 'badge bg-red-100 text-red-800',
  pending: 'badge bg-slate-100 text-slate-700',
};

/**
 * Who is in the ensemble and what they are playing. Contact columns appear only
 * when the API included them, which it does for administrators and owners.
 */
export function RosterPage(): JSX.Element {
  const { can } = useSession();
  const [section, setSection] = useState('');
  const [search, setSearch] = useState('');

  const roster = useQuery({ queryKey: ['roster'], queryFn: () => api<Roster>('/roster') });

  const rows = useMemo(() => {
    const all = roster.data?.musicians ?? [];
    const needle = search.trim().toLowerCase();
    return all.filter((musician) => {
      const matchesSection =
        !section ||
        musician.sections.some((s) => s.instrumentId === section) ||
        musician.parts.some((p) => p.instrumentId === section);
      const matchesSearch = !needle || musician.name.toLowerCase().includes(needle);
      return matchesSection && matchesSearch;
    });
  }, [roster.data, section, search]);

  const showContact = roster.data?.includesContact ?? false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Roster</h1>
        <p className="hint">
          {showContact
            ? 'Contact details are visible to administrators and owners.'
            : 'Contact details are withheld: only administrators and owners can see email and phone.'}
        </p>
      </div>

      <div className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="roster-search">
            Search
          </label>
          <input
            id="roster-search"
            className="input"
            placeholder="Name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="roster-section">
            Section
          </label>
          <select
            id="roster-section"
            className="input"
            value={section}
            onChange={(e) => setSection(e.target.value)}
          >
            <option value="">All sections</option>
            {roster.data?.instruments.map((instrument) => (
              <option key={instrument.id} value={instrument.id}>
                {instrument.name}
              </option>
            ))}
          </select>
        </div>
        <p className="hint ml-auto">
          {rows.length} of {roster.data?.musicians.length ?? 0} musicians
          {roster.data?.sectionScope?.length ? ' · limited to your sections' : ''}
        </p>
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Name</th>
                <th className="py-2">Sections (in order)</th>
                <th className="py-2">Parts</th>
                <th className="py-2">Doubling</th>
                <th className="py-2">Experience</th>
                <th className="py-2">Prefers</th>
                {showContact ? <th className="py-2">Contact</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((musician) => (
                <tr key={musician.id} className="border-t border-slate-100 align-top">
                  <td className="py-2">
                    <span className="font-medium">{musician.name}</span>
                    {musician.active ? null : <span className="hint block">inactive</span>}
                  </td>
                  <td className="py-2">
                    {musician.sections.map((s) => s.instrumentName).join(' → ') || '—'}
                  </td>
                  <td className="py-2">
                    {musician.parts.length === 0 ? (
                      <span className="hint">Unassigned</span>
                    ) : (
                      <ul className="space-y-1">
                        {musician.parts.map((part) => (
                          <li key={part.assignmentId} className="flex items-center gap-2">
                            <span>
                              {part.instrumentName} {part.partLabel}
                              <span className="hint"> · {part.songTitle}</span>
                            </span>
                            <span className={confirmationStyles[part.confirmation]}>
                              {part.confirmation}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="py-2">
                    {musician.willingToDouble === null ? '—' : musician.willingToDouble ? 'Yes' : 'No'}
                  </td>
                  <td className="py-2">{musician.experienceLevel ?? '—'}</td>
                  <td className="py-2">{musician.difficultyPreference ?? '—'}</td>
                  {showContact ? (
                    <td className="py-2 text-slate-600">
                      {musician.email}
                      {musician.phone ? <span className="block text-xs">{musician.phone}</span> : null}
                    </td>
                  ) : null}
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={showContact ? 7 : 6}>
                    {roster.isLoading ? 'Loading…' : 'Nobody matches those filters.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {can('roster.write') ? (
        <p className="hint">Add or edit musicians on the Musicians page.</p>
      ) : null}
    </div>
  );
}
