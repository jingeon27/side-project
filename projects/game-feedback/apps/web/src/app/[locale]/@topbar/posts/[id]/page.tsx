import { locale as rootLocale } from 'next/root-params';
import { DocumentContent } from '@/_app/index.server';
import { PostHeaderRoute } from '@/_pages/post/index.server';
import { PostTopbarPlaceholder } from '@/_app';

export default async function Page(props: Parameters<typeof PostHeaderRoute>[0]) {
  const locale = await rootLocale();
  return (
    <DocumentContent fallback={<PostTopbarPlaceholder home={`/${locale}`} />}>
      <PostHeaderRoute {...props} />
    </DocumentContent>
  );
}

export const instant = false;
