import { locale as rootLocale } from 'next/root-params';

import { DocumentContent } from '@/_app/index.server';
import { ProfileDocument, profileMetadata, ProfileRoute } from '@/_pages/profile/index.server';

export { profileMetadata as generateMetadata };
export default async function Page(props: Parameters<typeof ProfileRoute>[0]) {
  return (
    <ProfileDocument locale={await rootLocale()}>
      <DocumentContent>
        <ProfileRoute {...props} />
      </DocumentContent>
    </ProfileDocument>
  );
}

// Public documents deliberately finish authorized HTML and SEO before streaming.
// Production instant() tests guard the separate RSC navigation shell.
export const instant = false;
