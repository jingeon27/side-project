export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly errorCode: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (typeof options.body === 'string' && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json');
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    cache: 'no-store',
    headers,
  });
  if (response.status === 204) return undefined as T;
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error =
      payload && typeof payload === 'object' ? (payload as { errorCode?: string; message?: string }) : {};
    throw new ApiError(
      response.status,
      error.errorCode ?? 'REQUEST_FAILED',
      error.message ?? '요청을 처리하지 못했습니다.',
    );
  }
  return payload as T;
}
