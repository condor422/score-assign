import { Link } from 'react-router-dom';
import { useSession } from '../auth/SessionContext';

/** Surfaces the trial countdown and the free-tier fallback after it lapses. */
export function TrialBanner(): JSX.Element | null {
  const { session } = useSession();
  if (!session) return null;

  const { tenant } = session;

  // Suspension outranks the trial notice: nothing here can be changed.
  if (tenant.status === 'suspended') {
    return (
      <div className="mb-4 rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">
        This workspace is suspended and is read-only. You can still view your roster and
        assignments; registration is closed and changes are refused. Contact ScoreAssign support to
        restore it.
      </div>
    );
  }

  if (tenant.plan !== 'free' && tenant.status === 'active') return null;
  const canUpgrade = session.user.capabilities.includes('billing.manage');

  if (tenant.trialExpired) {
    return (
      <div className="mb-4 rounded-md border border-caution/40 bg-gold-50 px-4 py-3 text-sm text-caution">
        Your trial has ended. The free plan allows {tenant.limits.maxParts} parts and{' '}
        {tenant.limits.maxMusicians} musicians — your existing data is safe.{' '}
        {canUpgrade ? (
          <Link className="font-semibold underline" to="/billing">
            Upgrade from $12/month
          </Link>
        ) : (
          'Ask your owner to upgrade.'
        )}
      </div>
    );
  }

  if (tenant.status === 'trialing' && tenant.trialEndsAt) {
    const days = Math.max(
      0,
      Math.ceil((new Date(tenant.trialEndsAt).getTime() - Date.now()) / 86_400_000),
    );
    return (
      <div className="mb-4 rounded-md border border-maroon-100 bg-white px-4 py-3 text-sm">
        {days} day{days === 1 ? '' : 's'} left in your trial.{' '}
        {canUpgrade ? (
          <Link className="font-semibold underline" to="/billing">
            See plans
          </Link>
        ) : null}
      </div>
    );
  }

  return null;
}
