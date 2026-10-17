import { redirect } from 'next/navigation';
import { appRoutes } from '@game-feedback/bridge';
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  redirect(appRoutes.boards((await params).locale));
}
