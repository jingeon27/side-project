import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { preferredLocale, LANGUAGE_COOKIE } from '@/shared/i18n/index.server';
export default async function IndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [cookieStore, requestHeaders, query] = await Promise.all([cookies(), headers(), searchParams]);
  const locale = preferredLocale(
    cookieStore.get(LANGUAGE_COOKIE)?.value,
    requestHeaders.get('accept-language'),
  );
  const search = new URLSearchParams();
  for (const key of ['q', 'tab']) {
    const value = query[key];
    if (typeof value === 'string') search.set(key, value);
  }
  redirect(`/${locale}${search.size ? `?${search}` : ''}`);
}
