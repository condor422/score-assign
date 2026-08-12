/**
 * Thin fetch wrapper. The access token lives in memory only; the refresh
 * token is an httpOnly cookie the browser sends automatically, so a script
 * injected into the page cannot read a long-lived credential.
 */
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True when the request failed only because the plan is too small. */
  get isPlanLimit(): boolean {
    return this.status === 402;
  }
}

/**
 * The tenant is normally implied by the subdomain. In development the site is
 * often served from plain localhost, so the slug is echoed in a header as a
 * fallback -- the API only trusts it for public, unauthenticated routes.
 */
export function tenantSlugFromHost(): string | null {
  const host = window.location.hostname.toLowerCase();
  const labels = host.split('.');
  if (labels.length < 2) return null;
  const first = labels[0]!;
  if (['www', 'app', 'localhost', '127'].includes(first)) return null;
  return first;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = options.token ?? accessToken;
  if (token) headers.Authorization = `Bearer ${token}`;
  const slug = tenantSlugFromHost();
  if (slug) headers['x-tenant-slug'] = slug;

  const response = await fetch(`/api/v1${path}`, {
    method: options.method ?? 'GET',
    headers,
    credentials: 'include',
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string; details?: unknown } })
      ?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'error',
      error?.message ?? 'Request failed',
      error?.details,
    );
  }

  return payload as T;
}
