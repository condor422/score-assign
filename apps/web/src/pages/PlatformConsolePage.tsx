import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../lib/api';
import { useSession } from '../auth/SessionContext';
import { BrandMark } from '../components/BrandMark';
import { HelpTip } from '../components/HelpTip';
import type { PlatformDiscountCode, PlatformMetrics, PlatformTenant } from '../lib/types';

const money = (cents: number): string => `$${(cents / 100).toFixed(2)}`;
const date = (value: string | null): string =>
  value ? new Date(value).toLocaleDateString() : '—';

/**
 * Platform staff console: subscription state across tenants, the discount
 * verification queue, and the discount catalogue. Writes are limited to
 * resolving verification claims, toggling codes and suspending a workspace.
 */
export function PlatformConsolePage(): JSX.Element {
  const queryClient = useQueryClient();
  const { session } = useSession();
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  const metrics = useQuery({
    queryKey: ['platform-metrics'],
    queryFn: () => api<PlatformMetrics>('/admin/metrics'),
  });
  const tenants = useQuery({
    queryKey: ['platform-tenants', status],
    queryFn: () => api<PlatformTenant[]>(`/admin/tenants${status ? `?status=${status}` : ''}`),
  });
  const codes = useQuery({
    queryKey: ['platform-codes'],
    queryFn: () => api<PlatformDiscountCode[]>('/admin/discount-codes'),
  });

  const resolve = useMutation({
    mutationFn: (input: { tenantId: string; decision: 'approve' | 'reject' }) =>
      api(`/admin/tenants/${input.tenantId}/verify-discount`, {
        method: 'POST',
        body: { decision: input.decision },
      }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['platform-tenants'] });
      void queryClient.invalidateQueries({ queryKey: ['platform-metrics'] });
    },
    onError: (caught) =>
      setError(caught instanceof ApiError ? caught.message : 'Could not record that decision'),
  });

  const toggleCode = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      api(`/admin/discount-codes/${input.id}`, {
        method: 'PATCH',
        body: { active: input.active },
      }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['platform-codes'] });
    },
    onError: (caught) =>
      setError(caught instanceof ApiError ? caught.message : 'Could not update that code'),
  });

  const setTenantStatus = useMutation({
    mutationFn: (input: { tenantId: string; action: 'suspend' | 'restore'; reason?: string }) =>
      api(`/admin/tenants/${input.tenantId}/status`, {
        method: 'POST',
        body: { action: input.action, ...(input.reason ? { reason: input.reason } : {}) },
      }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['platform-tenants'] });
      void queryClient.invalidateQueries({ queryKey: ['platform-metrics'] });
    },
    onError: (caught) =>
      setError(caught instanceof ApiError ? caught.message : 'Could not change that workspace'),
  });

  function changeStatus(tenant: PlatformTenant): void {
    if (tenant.status === 'suspended') {
      if (!window.confirm(`Restore ${tenant.name} to its previous status?`)) return;
      setTenantStatus.mutate({ tenantId: tenant.id, action: 'restore' });
      return;
    }
    const reason = window.prompt(
      `Suspend ${tenant.name}? It becomes read-only and stops accepting registrations.\n\nReason (optional):`,
    );
    if (reason === null) return;
    setTenantStatus.mutate({ tenantId: tenant.id, action: 'suspend', reason: reason.trim() });
  }

  const pending = (tenants.data ?? []).filter((tenant) => tenant.pendingVerification);

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-maroon-100 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <BrandMark />
            <div>
              <p className="text-sm font-semibold text-maroon-900">ScoreAssign platform</p>
              <p className="text-xs text-slate-500">{session?.user.email} · platform staff</p>
            </div>
          </div>
          <Link className="btn-secondary" to="/">
            Back to {session?.tenant.name}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        {error ? (
          <div className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="card">
            <p className="hint">Active tenants</p>
            <p className="text-2xl font-semibold">{metrics.data?.tenantsByStatus.active ?? 0}</p>
          </div>
          <div className="card">
            <p className="hint">In trial</p>
            <p className="text-2xl font-semibold">{metrics.data?.tenantsByStatus.trialing ?? 0}</p>
          </div>
          <div className="card">
            <p className="hint">Awaiting verification</p>
            <p className="text-2xl font-semibold">{metrics.data?.pendingVerification ?? 0}</p>
          </div>
          <div className="card">
            <p className="hint">Paid plans</p>
            <p className="text-2xl font-semibold">
              {(metrics.data?.tenantsByPlan.monthly ?? 0) + (metrics.data?.tenantsByPlan.annual ?? 0)}
            </p>
            <p className="hint">
              {metrics.data?.tenantsByPlan.monthly ?? 0} monthly ·{' '}
              {metrics.data?.tenantsByPlan.annual ?? 0} annual
            </p>
          </div>
        </div>

        {pending.length ? (
          <div className="card space-y-2">
            <h2 className="flex items-center gap-1 text-sm font-semibold">
              Discount verification queue
              <HelpTip topic="discountVerification" />
            </h2>
            <p className="hint">
              These tenants claimed a code that requires proof (student ID, teaching post or
              501(c)(3) letter). Rejecting also removes the code from the tenant.
            </p>
            <ul className="divide-y divide-slate-100 text-sm">
              {pending.map((tenant) => (
                <li key={tenant.id} className="flex items-center justify-between gap-4 py-2">
                  <div>
                    <p className="font-medium">
                      {tenant.name} <span className="hint">({tenant.slug})</span>
                    </p>
                    <p className="hint">
                      {tenant.contactEmail}
                      {tenant.discountCode ? ` · claimed ${tenant.discountCode.code}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn-primary"
                      type="button"
                      disabled={resolve.isPending}
                      onClick={() => resolve.mutate({ tenantId: tenant.id, decision: 'approve' })}
                    >
                      Approve
                    </button>
                    <button
                      className="btn-secondary"
                      type="button"
                      disabled={resolve.isPending}
                      onClick={() => resolve.mutate({ tenantId: tenant.id, decision: 'reject' })}
                    >
                      Reject
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="card space-y-3">
          <div className="flex items-end justify-between gap-3">
            <h2 className="flex items-center gap-1 text-sm font-semibold">
              Tenants
              <HelpTip topic="suspendTenant" />
            </h2>
            <div>
              <label className="label" htmlFor="tenant-status">
                Status
              </label>
              <select
                id="tenant-status"
                className="input"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">All</option>
                <option value="trialing">Trialing</option>
                <option value="active">Active</option>
                <option value="past_due">Past due</option>
                <option value="suspended">Suspended</option>
                <option value="canceled">Canceled</option>
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2">Workspace</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Plan</th>
                  <th className="py-2">Seats</th>
                  <th className="py-2">Trial ends</th>
                  <th className="py-2">Renews</th>
                  <th className="py-2">Discount</th>
                  <th className="py-2">Access</th>
                </tr>
              </thead>
              <tbody>
                {tenants.data?.map((tenant) => (
                  <tr key={tenant.id} className="border-t border-slate-100">
                    <td className="py-2">
                      <span className="font-medium">{tenant.name}</span>
                      <span className="hint block">
                        {tenant.slug} · {tenant.contactEmail}
                      </span>
                    </td>
                    <td className="py-2">
                      {tenant.status}
                      {tenant.status === 'suspended' ? (
                        <span className="hint block">
                          since {date(tenant.suspendedAt)}
                          {tenant.suspensionReason ? ` · ${tenant.suspensionReason}` : ''}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2">
                      {tenant.plan}
                      {tenant.plan === 'free' ? '' : ` / ${tenant.interval}`}
                    </td>
                    <td className="py-2">{tenant.seats}</td>
                    <td className="py-2">{date(tenant.trialEndsAt)}</td>
                    <td className="py-2">{date(tenant.currentPeriodEnd)}</td>
                    <td className="py-2">
                      {tenant.discountCode ? tenant.discountCode.code : '—'}
                      {tenant.pendingVerification ? (
                        <span className="badge ml-1 bg-gold-100 text-gold-800">unverified</span>
                      ) : null}
                    </td>
                    <td className="py-2">
                      <button
                        className={tenant.status === 'suspended' ? 'btn-secondary' : 'btn-danger'}
                        type="button"
                        disabled={setTenantStatus.isPending}
                        onClick={() => changeStatus(tenant)}
                      >
                        {tenant.status === 'suspended' ? 'Restore' : 'Suspend'}
                      </button>
                    </td>
                  </tr>
                ))}
                {tenants.data?.length === 0 ? (
                  <tr>
                    <td className="py-3 text-slate-500" colSpan={8}>
                      No tenants match that filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card space-y-3">
          <h2 className="flex items-center gap-1 text-sm font-semibold">
            Discount codes
            <HelpTip topic="discountCode" />
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2">Code</th>
                  <th className="py-2">Discount</th>
                  <th className="py-2">Applies to</th>
                  <th className="py-2">Redemptions</th>
                  <th className="py-2">Proof</th>
                  <th className="py-2">Active</th>
                </tr>
              </thead>
              <tbody>
                {codes.data?.map((code) => (
                  <tr key={code.id} className="border-t border-slate-100">
                    <td className="py-2">
                      <span className="font-medium">{code.code}</span>
                      <span className="hint block">{code.label}</span>
                    </td>
                    <td className="py-2">
                      {code.type === 'percent' ? `${code.value}%` : money(code.value)}
                    </td>
                    <td className="py-2">{code.appliesToPlanKeys.join(', ')}</td>
                    <td className="py-2">
                      {code.redemptionCount}
                      {code.maxRedemptions === null ? '' : ` / ${code.maxRedemptions}`}
                    </td>
                    <td className="py-2">{code.requiresVerification ? 'Required' : '—'}</td>
                    <td className="py-2">
                      <button
                        className="btn-secondary"
                        type="button"
                        disabled={toggleCode.isPending}
                        onClick={() => toggleCode.mutate({ id: code.id, active: !code.active })}
                      >
                        {code.active ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
