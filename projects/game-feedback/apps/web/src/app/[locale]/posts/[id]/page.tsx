import { locale as rootLocale } from 'next/root-params';

import { DocumentContent, isClientNavigation } from '@/_app/index.server';
import { PostDocument, postMetadata, PostRoute } from '@/_pages/post/index.server';

export { postMetadata as generateMetadata };
export default async function Page(props: Parameters<typeof PostRoute>[0]) {
  return (
    <PostDocument locale={await rootLocale()} params={props.params} streamHeader={await isClientNavigation()}>
      <DocumentContent>
        <PostRoute {...props} />
      </DocumentContent>
    </PostDocument>
  );
}

// Public documents deliberately finish authorized HTML and SEO before streaming.
// Production instant() tests guard the separate RSC navigation shell.
export const instant = false;
