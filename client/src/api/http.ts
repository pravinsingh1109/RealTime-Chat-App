export class ApiError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

const TOKEN_KEY = 'pulse.access-token';
const rawBaseUrl = import.meta.env.VITE_API_URL || '/api';
export const apiBaseUrl = rawBaseUrl.replace(/\/$/, '');

export function getAccessToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  authenticated?: boolean;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, authenticated = true, headers: givenHeaders, ...init } = options;
  const headers = new Headers(givenHeaders);
  const isFormData = body instanceof FormData;

  if (body !== undefined && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (authenticated) {
    const token = getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers,
      body: body === undefined || isFormData ? (body as BodyInit | undefined) : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Unable to reach the server. Check your connection and try again.', 0);
  }

  const contentType = response.headers.get('content-type') || '';
  const payload: unknown = contentType.includes('application/json')
    ? await response.json().catch(() => undefined)
    : await response.text().catch(() => undefined);

  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null
      ? String((payload as { message?: string; error?: string }).message ?? (payload as { error?: string }).error ?? 'Something went wrong.')
      : 'Something went wrong.';
    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}

export function assetUrl(value?: string): string | undefined {
  if (!value || /^https?:\/\//i.test(value) || value.startsWith('blob:')) return value;
  const origin = apiBaseUrl.startsWith('http') ? new URL(apiBaseUrl).origin : '';
  return `${origin}${value.startsWith('/') ? value : `/${value}`}`;
}
