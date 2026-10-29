import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import {
  getGroupMetadata,
  getGroupSeoData,
  groupJsonLd,
  GroupPageTemplate,
  parseGroupCategory,
} from '@/_pages/group';
import { PreloadQuery } from '@/shared/api/apollo-client.server';
import {
  GalleryDocument,
  GalleryPostsDocument,
  GroupVisibility,
  MeDocument,
  PostSort,
} from '@/shared/api/generated';
import { getWebOrigin } from '@/shared/api/server-request.helper';
import { JsonLd } from '@/shared/ui/@core/json-ld';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const metadata = await getGroupMetadata((await params).id);
  if (!metadata) notFound();
  return metadata;
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const seo = await getGroupSeoData(id);
  if (!seo) notFound();
  const categoryId = parseGroupCategory((await searchParams).category, seo.group.categories);
  const jsonLd = groupJsonLd(seo, getWebOrigin());
  return (
    <>
      {jsonLd ? <JsonLd data={jsonLd} /> : null}
      <PreloadQuery query={MeDocument}>
        <PreloadQuery query={GalleryDocument} variables={{ id }} errorPolicy="all">
          {seo.group.visibility === GroupVisibility.Private ? (
            <GroupPageTemplate id={id} />
          ) : (
            <PreloadQuery
              query={GalleryPostsDocument}
              variables={{
                groupId: id,
                ...(categoryId ? { categoryId } : {}),
                sort: PostSort.Newest,
                offset: 0,
                limit: 24,
              }}
              errorPolicy="all"
            >
              <PreloadQuery
                query={GalleryPostsDocument}
                variables={{ groupId: id, sort: PostSort.MonthlyPopular, offset: 0, limit: 3 }}
                errorPolicy="all"
              >
                <GroupPageTemplate id={id} />
              </PreloadQuery>
            </PreloadQuery>
          )}
        </PreloadQuery>
      </PreloadQuery>
    </>
  );
}
