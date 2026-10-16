const privateKey = /authorization|cookie|password|secret|token|email|ip_address|user_id|search_query/i;

function redactString(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
    .replace(/https?:\/\/[^\s"'<>]+/gi, (address) => {
      try {
        const url = new URL(address);
        return `${url.origin}${url.pathname}`;
      } catch {
        return '[url]';
      }
    });
}

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 12) return '[truncated]';
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map((item) => scrub(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !privateKey.test(key))
      .map(([key, item]) => [key, scrub(item, depth + 1)]),
  );
}

export function scrubSentryEvent<T>(event: T): T | null {
  const safe = scrub(event) as Record<string, unknown>;
  const exception = JSON.stringify(safe.exception || '');
  if (/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/.test(exception)) return null;
  delete safe.user;
  if (safe.request && typeof safe.request === 'object') {
    const request = safe.request as Record<string, unknown>;
    delete request.data;
    delete request.headers;
    delete request.cookies;
    delete request.query_string;
  }
  return safe as T;
}

export function scrubSentryBreadcrumb<T>(breadcrumb: T): T {
  return scrub(breadcrumb) as T;
}
