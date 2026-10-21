import { Suspense } from 'react';
import { LoginTopbarRoute } from '@/_pages/login/index.server';

export default function Page(props: Parameters<typeof LoginTopbarRoute>[0]) {
  return (
    <Suspense fallback={null}>
      <LoginTopbarRoute {...props} />
    </Suspense>
  );
}
