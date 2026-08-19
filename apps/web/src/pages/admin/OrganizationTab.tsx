import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api';
import { HelpTip } from '../../components/HelpTip';
import { UNLIMITED, type Organization } from '../../lib/types';

/** Workspace identity plus a read-only summary of the plan in force. */
export function OrganizationTab(): JSX.Element {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({ name: '', contactEmail: '', timezone: '' });

  const organization = useQuery({
    queryKey: ['organization'],
    queryFn: () => api<Organization>('/organization'),
  });

  useEffect(() => {
    if (!organization.data) return;
    setForm({
      name: organization.data.name,
      contactEmail: organization.data.contactEmail,
      timezone: organization.data.timezone,
    });
  }, [organization.data]);

  const save = useMutation({
    mutationFn: () =>
      api('/organization', {
        method: 'PATCH',
        body: {
          name: form.name,
          contactEmail: form.contactEmail,
          timezone: form.timezone,
        },
      }),
    onSuccess: () => {
      setError(null);
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ['organization'] });
      void queryClient.invalidateQueries({ queryKey: ['session'] });
    },
    onError: (caught) => {
      setSaved(false);
      setError(caught instanceof ApiError ? caught.message : 'Could not save those settings');
    },
  });

  const limits = organization.data?.limits;
  /** The API models "no cap" as a large sentinel rather than Infinity, which JSON cannot carry. */
  const cap = (value: number): string => (value >= UNLIMITED ? 'unlimited' : String(value));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form
        className="card space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <h2 className="font-semibold">Workspace</h2>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {saved && !save.isPending ? <p className="text-sm text-success">Saved.</p> : null}

        <div>
          <label className="label" htmlFor="org-name">
            Ensemble name
          </label>
          <input
            id="org-name"
            className="input"
            value={form.name}
            onChange={(event) => {
              setSaved(false);
              setForm({ ...form, name: event.target.value });
            }}
            required
          />
          <p className="hint">Shown in the header, on the intake form and in musician emails.</p>
        </div>

        <div>
          <label className="label" htmlFor="org-email">
            Contact email
          </label>
          <input
            id="org-email"
            className="input"
            type="email"
            value={form.contactEmail}
            onChange={(event) => {
              setSaved(false);
              setForm({ ...form, contactEmail: event.target.value });
            }}
          />
          <p className="hint">Where musicians are told to reply with questions.</p>
        </div>

        <div>
          <label className="label" htmlFor="org-timezone">
            Time zone
          </label>
          <input
            id="org-timezone"
            className="input"
            value={form.timezone}
            onChange={(event) => {
              setSaved(false);
              setForm({ ...form, timezone: event.target.value });
            }}
            placeholder="America/Phoenix"
          />
          <p className="hint">Used when rehearsal and concert dates are displayed.</p>
        </div>

        <button className="btn-primary" type="submit" disabled={save.isPending}>
          Save workspace
        </button>
      </form>

      <div className="card space-y-2">
        <h2 className="flex items-center gap-1 font-semibold">
          Plan in force
          <HelpTip topic="planLimits" />
        </h2>
        <p className="text-sm">
          Address: <span className="font-medium">{organization.data?.slug}.scoreassign.com</span>
        </p>
        <p className="text-sm">
          Plan: <span className="font-medium">{organization.data?.plan}</span> ·{' '}
          {organization.data?.status}
        </p>
        {limits ? (
          <ul className="hint space-y-1">
            <li>Parts: {cap(limits.maxParts)}</li>
            <li>Musicians: {cap(limits.maxMusicians)}</li>
            <li>Songs: {cap(limits.maxSongs)}</li>
            <li>Staff seats: {limits.maxSeats}</li>
          </ul>
        ) : null}
        <p className="hint">Change plans on the Plan tab; only an owner may do that.</p>
      </div>
    </div>
  );
}
