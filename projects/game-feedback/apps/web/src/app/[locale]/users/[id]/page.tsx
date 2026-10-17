import { ProfileRoute, profileMetadata } from '@/_pages/profile/index.server';
import { DocumentContent } from '@/_app/index.server';
export { profileMetadata as generateMetadata };
export default function Page(props: Parameters<typeof ProfileRoute>[0]) {
  return (
    <DocumentContent>
      <ProfileRoute {...props} />
    </DocumentContent>
  );
}

// Public documents deliberately finish authorized HTML and SEO before streaming.
// Production instant() tests guard the separate RSC navigation shell.
export const instant = false;
