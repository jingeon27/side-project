import { InvitePage } from '@/_pages/invite/@page/invite-page';
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InvitePage token={token} />;
}
