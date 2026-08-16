import { useEffect } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api';
import { useMusicianSession } from '../../auth/MusicianSession';

/** Landing page for the emailed link: exchanges the one-time token for a session. */
export function MusicianVerifyPage(): JSX.Element {
  const [params] = useSearchParams();
  const { token, adopt } = useMusicianSession();
  const linkToken = params.get('token');

  const verify = useMutation({
    mutationFn: (value: string) =>
      api<{ accessToken: string }>('/musician-auth/verify', {
        method: 'POST',
        body: { token: value },
      }),
    onSuccess: (result) => adopt(result.accessToken),
  });

  useEffect(() => {
    if (linkToken && !verify.isPending && !verify.isSuccess && !verify.isError) {
      verify.mutate(linkToken);
    }
  }, [linkToken, verify]);

  if (token) return <Navigate to="/musician/parts" replace />;

  if (!linkToken) return <Navigate to="/musician/sign-in" replace />;

  return (
    <div className="card mx-auto max-w-sm space-y-3 text-sm">
      {verify.isError ? (
        <>
          <h1 className="text-lg font-semibold">That link is no longer valid</h1>
          <p className="text-slate-600">
            {verify.error instanceof ApiError
              ? verify.error.message
              : 'Sign-in links expire after 30 minutes and can only be used once.'}
          </p>
          <Link className="btn-primary inline-block" to="/musician/sign-in">
            Request a new link
          </Link>
        </>
      ) : (
        <p className="text-slate-600">Signing you in…</p>
      )}
    </div>
  );
}
