import { redirect } from 'next/navigation';

import qs from 'qs';

import { ROUTES } from '@/shared/constants/routes';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; loginError?: string | string[] }>;
}) {
  const { next, loginError } = await searchParams;
  // 같은 키가 반복되면 배열이 들어온다. 문자열 값만 넘겨 배열이 대괄호 키로 바뀌지 않게 한다.
  const search = qs.stringify(
    {
      next: typeof next === 'string' && next ? next : undefined,
      loginError: typeof loginError === 'string' && loginError ? loginError : undefined,
    },
    { addQueryPrefix: true },
  );
  redirect(`${ROUTES.SIGN}${search}`);
}
