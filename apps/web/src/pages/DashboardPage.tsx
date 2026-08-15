import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useSession } from '../auth/SessionContext';
import type { FormSummary, Season, Usage } from '../lib/types';

function Meter({ label, used, limit }: { label: string; used: number; limit: number }): JSX.Element {
  const pct = limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-slate-500">
          {used} / {limit >= 1000 ? '∞' : limit}
        </span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-slate-200">
        <div
          className={pct >= 100 ? 'h-2 rounded-full bg-red-500' : 'h-2 rounded-full bg-ink'}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function DashboardPage(): JSX.Element {
  const { session } = useSession();
  const usage = useQuery({ queryKey: ['usage'], queryFn: () => api<Usage>('/usage') });
  const seasons = useQuery({ queryKey: ['seasons'], queryFn: () => api<Season[]>('/seasons') });
  const forms = useQuery({ queryKey: ['forms'], queryFn: () => api<FormSummary[]>('/forms') });

  const openForm = forms.data?.find((f) => f.status === 'open') ?? forms.data?.[0];
  const intakeUrl = openForm
    ? `${window.location.protocol}//${session?.tenant.slug}.${window.location.host.replace(/^[^.]+\./, '')}/register/${openForm.slug}`
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Overview</h1>
        <p className="hint">Everything for {session?.tenant.name} lives in its own database.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card space-y-3">
          <h2 className="text-sm font-semibold">Plan usage</h2>
          {usage.data ? (
            <>
              <Meter label="Parts" used={usage.data.usage.parts} limit={usage.data.limits.maxParts} />
              <Meter
                label="Musicians"
                used={usage.data.usage.musicians}
                limit={usage.data.limits.maxMusicians}
              />
              <Meter label="Songs" used={usage.data.usage.songs} limit={usage.data.limits.maxSongs} />
            </>
          ) : (
            <p className="hint">Loading…</p>
          )}
        </div>

        <div className="card space-y-2">
          <h2 className="text-sm font-semibold">Intake form</h2>
          {openForm ? (
            <>
              <p className="text-sm">
                {openForm.title}{' '}
                <span
                  className={
                    openForm.status === 'open'
                      ? 'badge bg-green-100 text-green-800'
                      : 'badge bg-slate-100 text-slate-700'
                  }
                >
                  {openForm.status}
                </span>
              </p>
              <p className="hint">{openForm.responseCount} response(s)</p>
              {intakeUrl ? (
                <p className="break-all rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">{intakeUrl}</p>
              ) : null}
              <Link className="btn-secondary" to="/form">
                Edit questions
              </Link>
            </>
          ) : (
            <p className="hint">No form yet.</p>
          )}
        </div>

        <div className="card space-y-2">
          <h2 className="text-sm font-semibold">Season</h2>
          {seasons.data?.[0] ? (
            <>
              <p className="text-sm">{seasons.data[0].name}</p>
              <p className="hint">{seasons.data[0].status}</p>
              <div className="flex gap-2">
                <Link className="btn-secondary" to="/program">
                  Songs &amp; parts
                </Link>
                <Link className="btn-primary" to="/assignments">
                  Assign parts
                </Link>
              </div>
            </>
          ) : (
            <p className="hint">Loading…</p>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold">How this works</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
          <li>Publish your intake form and share the link with your players.</li>
          <li>Enter the songs and their parts (instrument plus 1st, 2nd, 3rd…).</li>
          <li>
            Press <span className="font-medium">Assign parts</span> when registration closes — nothing is
            assigned until you ask for it.
          </li>
          <li>Drag musicians between parts to fine-tune, then email everyone their parts.</li>
        </ol>
      </div>
    </div>
  );
}
