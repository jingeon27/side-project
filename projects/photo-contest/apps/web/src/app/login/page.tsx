import { redirect } from 'next/navigation';

import { ROUTES } from '@/shared/constants/routes';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; loginError?: string }>;
}) {
  const params = await searchParams;
  const search = new URLSearchParams();
  if (params.next) search.set('next', params.next);
  if (params.loginError) search.set('loginError', params.loginError);
  redirect(`${ROUTES.SIGN}${search.size ? `?${search}` : ''}`);
}
