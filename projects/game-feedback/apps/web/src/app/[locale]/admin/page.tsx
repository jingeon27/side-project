import { AdminPage } from '@/_pages/admin';
import { createPageMetadata } from '@/shared/seo';
export default function Page() {
  return <AdminPage />;
}
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return createPageMetadata({
    title: '운영 관리',
    description: '관리자 문의, 신고, 사용자 인증과 제재 관리',
    path: `/${locale}/admin`,
    privatePage: true,
  });
}
