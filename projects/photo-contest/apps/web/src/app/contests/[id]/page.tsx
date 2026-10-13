import { ContestPage } from '@/_pages/contest/@page/contest-page';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ContestPage id={id} />;
}
