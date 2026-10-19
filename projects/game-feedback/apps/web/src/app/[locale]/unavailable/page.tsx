import type { Metadata } from 'next';
export { NotFoundPage as default } from '@/_pages/not-found';
export const metadata: Metadata = {
  title: '페이지를 찾을 수 없어요',
  robots: { index: false, follow: false },
};
