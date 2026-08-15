import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../lib/api';
import { useSession } from '../auth/SessionContext';
import { roleLabels, type Instrument, type TenantRole } from '../lib/types';

interface TeamResponse {
  members: {
    id: string;
    name: string;
    email: string;
    role: TenantRole;
    sectionInstrumentIds: string[];
  }[];
  pendingInvites: { id: string; email: string; role: TenantRole; sectionInstrumentIds: string[] }[];
  grantableRoles: TenantRole[];
}

export function TeamPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { session } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ email: string; role: TenantRole; section: string }>({
    email: '',
    role: 'director',
    section: '',
  });

  const team = useQuery({ queryKey: ['team'], queryFn: () => api<TeamResponse>('/team') });
  const instruments = useQuery({
    queryKey: ['instruments'],
    queryFn: () => api<Instrument[]>('/instruments'),
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['team'] });
  };

  const sendInvite = useMutation({
    mutationFn: () =>
      api('/team/invites', {
        method: 'POST',
        body: {
          email: invite.email,
          role: invite.role,
          sectionInstrumentIds:
            invite.role === 'section_leader' && invite.section ? [invite.section] : [],
        },
      }),
    onSuccess: () => {
      setInvite({ email: '', role: 'director', section: '' });
      setError(null);
      invalidate();
    },
    onError: (caught) =>
      setError(caught instanceof ApiError ? caught.message : 'Could not send that invitation'),
  });

  const changeRole = useMutation({
    mutationFn: (input: { userId: string; role: TenantRole; sectionInstrumentIds: string[] }) =>
      api(`/team/members/${input.userId}`, {
        method: 'PATCH',
        body: { role: input.role, sectionInstrumentIds: input.sectionInstrumentIds },
      }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (caught) =>
      setError(caught instanceof ApiError ? caught.message : 'Could not change that role'),
  });

  const grantable = team.data?.grantableRoles ?? [];
  const instrumentName = (id: string): string =>
    instruments.data?.find((i) => i.id === id)?.name ?? 'Unknown';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Team</h1>
        <p className="hint">
          Directors run the program; administrators additionally see contact details and raw
          registrations. Section leaders see only their own sections.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <form
        className="card flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          sendInvite.mutate();
        }}
      >
        <div>
          <label className="label" htmlFor="invite-email">
            Invite by email
          </label>
          <input
            id="invite-email"
            className="input"
            type="email"
            value={invite.email}
            onChange={(e) => setInvite((prev) => ({ ...prev, email: e.target.value }))}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="invite-role">
            Role
          </label>
          <select
            id="invite-role"
            className="input"
            value={invite.role}
            onChange={(e) => setInvite((prev) => ({ ...prev, role: e.target.value as TenantRole }))}
          >
            {grantable.map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </select>
        </div>
        {invite.role === 'section_leader' ? (
          <div>
            <label className="label" htmlFor="invite-section">
              Section
            </label>
            <select
              id="invite-section"
              className="input"
              value={invite.section}
              onChange={(e) => setInvite((prev) => ({ ...prev, section: e.target.value }))}
            >
              <option value="">Whole ensemble</option>
              {instruments.data?.map((instrument) => (
                <option key={instrument.id} value={instrument.id}>
                  {instrument.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <button className="btn-primary" type="submit" disabled={sendInvite.isPending}>
          Send invitation
        </button>
      </form>

      <div className="card">
        <h2 className="mb-2 text-sm font-semibold">Members</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Name</th>
                <th className="py-2">Email</th>
                <th className="py-2">Role</th>
                <th className="py-2">Sections</th>
              </tr>
            </thead>
            <tbody>
              {team.data?.members.map((member) => {
                const isSelf = member.id === session?.user.id;
                const canEdit = !isSelf && grantable.includes(member.role);
                return (
                  <tr key={member.id} className="border-t border-slate-100">
                    <td className="py-2">
                      {member.name}
                      {isSelf ? <span className="hint"> (you)</span> : null}
                    </td>
                    <td className="py-2 text-slate-600">{member.email}</td>
                    <td className="py-2">
                      {canEdit ? (
                        <select
                          className="input"
                          value={member.role}
                          onChange={(e) =>
                            changeRole.mutate({
                              userId: member.id,
                              role: e.target.value as TenantRole,
                              sectionInstrumentIds: member.sectionInstrumentIds,
                            })
                          }
                        >
                          {grantable.map((role) => (
                            <option key={role} value={role}>
                              {roleLabels[role]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        roleLabels[member.role]
                      )}
                    </td>
                    <td className="py-2">
                      {member.sectionInstrumentIds.length === 0
                        ? '—'
                        : member.sectionInstrumentIds.map(instrumentName).join(', ')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {team.data?.pendingInvites.length ? (
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold">Pending invitations</h2>
          <ul className="space-y-1 text-sm">
            {team.data.pendingInvites.map((pending) => (
              <li key={pending.id}>
                {pending.email} · {roleLabels[pending.role]}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
