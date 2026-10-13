import type { Metadata } from 'next';
import { PreloadQuery } from '@/shared/api/server';
import { MeDocument } from '@/shared/api/generated';
import { AppProvider } from '@/_app/provider';
import { Shell } from '@/_app/shell';
import '@/_app/styles/globals.css';
export const metadata: Metadata = {
  title: '웃긴순간 — 우리끼리 사진 대회',
  description: '친구들과 비공개 사진 대회를 열고 최고의 순간을 뽑아보세요.',
};
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <AppProvider apiUrl={process.env.API_URL ?? 'http://127.0.0.1:4200'}>
          <PreloadQuery query={MeDocument}>
            <Shell>{children}</Shell>
          </PreloadQuery>
        </AppProvider>
      </body>
    </html>
  );
}
