import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  GroupContestsPageTemplate,
  getGroupContestsSeoData,
  getGroupContestsMetadata,
  groupContestsJsonLd,
} from '@/_pages/group-contests';
import { PreloadQuery } from '@/shared/api/apollo-client.server';
import {
  GalleryDocument,
  GroupContestFilter,
  GroupContestsDocument,
  GroupVisibility,
  MeDocument,
} from '@/shared/api/generated';
import { getWebOrigin } from '@/shared/api/server-request.helper';
import { JsonLd } from '@/shared/ui/@core/json-ld';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const metadata = await getGroupContestsMetadata((await params).id, false);
  if (!metadata) notFound();
  return metadata;
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const seo = await getGroupContestsSeoData(id, false);
  if (!seo) notFound();
  const jsonLd = groupContestsJsonLd(seo, false, getWebOrigin());
  const content = <GroupContestsPageTemplate groupId={id} hallOfFame={false} />;
  return (
    <>
      {jsonLd ? <JsonLd data={jsonLd} /> : null}
      <PreloadQuery query={MeDocument}>
        <PreloadQuery query={GalleryDocument} variables={{ id }} errorPolicy="all">
          {seo.group.visibility === GroupVisibility.Public ? (
            <PreloadQuery
              query={GroupContestsDocument}
              variables={{ groupId: id, filter: GroupContestFilter.Active, offset: 0, limit: 24 }}
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
