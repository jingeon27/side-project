import { PostRoute, postMetadata } from '@/_pages/post/index.server';
import { DocumentContent } from '@/_app/index.server';
export { postMetadata as generateMetadata };
export default function Page(props: Parameters<typeof PostRoute>[0]) {
  return (
    <DocumentContent>
      <PostRoute {...props} />
    </DocumentContent>
  );
}

// Public documents deliberately finish authorized HTML and SEO before streaming.
// Production instant() tests guard the separate RSC navigation shell.
export const instant = false;
