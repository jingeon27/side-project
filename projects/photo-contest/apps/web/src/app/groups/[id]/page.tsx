import { GroupPage } from '@/_pages/group/@page/group-page';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GroupPage id={id} />;
}
