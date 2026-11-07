import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import { GroupHallOfFamePage } from '@/_pages/group-contests';
import {
  getGroupContestsMetadata,
  getGroupContestsSeoData,
  GROUP_HALL_OF_FAME_LISTING,
  groupContestsJsonLd,
} from '@/_pages/group-contests/index.server';
import { PreloadQuery } from '@/shared/api/apollo-client.server';
import { GalleryDocument, GroupContestsDocument, GroupVisibility, MeDocument } from '@/shared/api/generated';
import { getWebOrigin } from '@/shared/api/server-request.helper';
import { JsonLd } from '@/shared/ui/@core/json-ld';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const metadata = await getGroupContestsMetadata((await params).id, GROUP_HALL_OF_FAME_LISTING);
  if (!metadata) notFound();
  return metadata;
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const seo = await getGroupContestsSeoData(id, GROUP_HALL_OF_FAME_LISTING);
  if (!seo) notFound();
  const jsonLd = groupContestsJsonLd(seo, GROUP_HALL_OF_FAME_LISTING, getWebOrigin());
  const content = <GroupHallOfFamePage groupId={id} />;
  return (
    <>
      {jsonLd ? <JsonLd data={jsonLd} /> : null}
      <PreloadQuery query={MeDocument}>
        <PreloadQuery query={GalleryDocument} variables={{ id }} errorPolicy="all">
          {seo.group.visibility === GroupVisibility.Public ? (
            <PreloadQuery
              query={GroupContestsDocument}
              variables={{ groupId: id, filter: GROUP_HALL_OF_FAME_LISTING.filter, offset: 0, limit: 24 }}
              errorPolicy="all"
            >
              {content}
            </PreloadQuery>
          ) : (
            content
          )}
        </PreloadQuery>
      </PreloadQuery>
    </>
  );
}

export const instant = true;
