import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../lib/api';
import { useSession } from '../auth/SessionContext';
import type { PlansResponse, Quote } from '../lib/types';

const money = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

export function BillingPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { refresh } = useSession();
  const [code, setCode] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const plans = useQuery({ queryKey: ['plans'], queryFn: () => api<PlansResponse>('/billing/plans') });

  const preview = useMutation({
    mutationFn: () => api<Quote>('/billing/quote', { method: 'POST', body: { discountCode: code } }),
    onSuccess: (result) => {
      setQuote(result);
      setError(null);
    },
    onError: (caught) => {
      setQuote(null);
      setError(caught instanceof ApiError ? caught.message : 'Could not check that code');
    },
  });

  const checkout = useMutation({
    mutationFn: () =>
      api<{ checkoutUrl: string; quote: Quote; activated: boolean }>('/billing/checkout', {
        method: 'POST',
        body: { planKey: 'annual', ...(code ? { discountCode: code } : {}) },
      }),
    onSuccess: async (result) => {
      setError(null);
      setMessage(
        result.activated
          ? `Annual plan activated at ${money(result.quote.totalCents)}. Billing is stubbed, so no card was charged.`
          : 'Continue in the checkout window to finish.',
      );
      void queryClient.invalidateQueries({ queryKey: ['plans'] });
      void queryClient.invalidateQueries({ queryKey: ['usage'] });
      await refresh().catch(() => undefined);
    },
    onError: (caught) =>
      setError(caught instanceof ApiError ? caught.message : 'Could not start checkout'),
  });

  const current = plans.data?.current;
  const annual = plans.data?.plans.find((p) => p.key === 'annual');
  const free = plans.data?.plans.find((p) => p.key === 'free');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Plan</h1>
        <p className="hint">
          {current
            ? `Currently on ${current.plan} · ${current.status}${
                current.currentPeriodEnd
                  ? ` · renews ${new Date(current.currentPeriodEnd).toLocaleDateString()}`
                  : ''
              }`
            : 'Loading…'}
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-md border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-800">
          {message}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-2">
          <h2 className="text-sm font-semibold">Free</h2>
          <p className="text-2xl font-semibold">$0</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>Up to {free?.limits.maxParts ?? 3} parts</li>
            <li>Up to {free?.limits.maxMusicians ?? 10} musicians</li>
            <li>Automatic assignment and the drag-and-drop board</li>
          </ul>
        </div>

        <div className="card space-y-3">
          <h2 className="text-sm font-semibold">Annual</h2>
          <p className="text-2xl font-semibold">
            {annual ? money(annual.priceCents) : '$96.00'}
            <span className="text-sm font-normal text-slate-500"> / year</span>
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>Unlimited parts, musicians and songs</li>
            <li>Musician logins, confirmations and part emails</li>
            <li>Run history with revert</li>
          </ul>

          <div>
            <label className="label" htmlFor="code">
              Discount code
            </label>
            <div className="flex gap-2">
              <input
                id="code"
                className="input"
                placeholder="STUDENT30"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
              <button
                className="btn-secondary whitespace-nowrap"
                type="button"
                disabled={!code || preview.isPending}
                onClick={() => preview.mutate()}
              >
                Apply
              </button>
            </div>
            <p className="hint">Students, teachers and 501(c)(3) ensembles qualify for a discount.</p>
          </div>

          {quote ? (
            <dl className="rounded-md bg-slate-50 px-3 py-2 text-sm">
              <div className="flex justify-between">
                <dt>Annual plan</dt>
                <dd>{money(quote.listPriceCents)}</dd>
              </div>
              <div className="flex justify-between text-green-700">
                <dt>{quote.label ?? 'Discount'}</dt>
                <dd>−{money(quote.discountCents)}</dd>
              </div>
              <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 font-semibold">
                <dt>Total</dt>
                <dd>{money(quote.totalCents)}</dd>
              </div>
              {quote.requiresVerification ? (
                <p className="hint mt-1">
                  We will ask for proof of eligibility (student ID, teaching post or 501(c)(3) letter).
                </p>
              ) : null}
            </dl>
          ) : null}

          <button
            className="btn-primary w-full"
            type="button"
            disabled={checkout.isPending}
            onClick={() => checkout.mutate()}
          >
            {checkout.isPending ? 'Starting…' : 'Subscribe annually'}
          </button>
          <p className="hint">
            Payments are not connected yet — checkout runs against a stub provider, so nothing is charged.
          </p>
        </div>
      </div>
    </div>
  );
}
