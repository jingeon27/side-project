import { ContestPageTemplate } from '@/_pages/contest';
import { contestSearchSchema } from '@/_pages/contest/@page/model/contest-search.schema';
import { PreloadQuery } from '@/shared/api/apollo-client.server';
import { ContestDocument, MeDocument, SubmissionsDocument } from '@/shared/api/generated';

const SORT = { latest: 'NEWEST', popular: 'MOST_LIKED' } as const;

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { sort } = contestSearchSchema.parse(await searchParams);
  return (
    <PreloadQuery query={MeDocument}>
      <PreloadQuery query={ContestDocument} variables={{ id }}>
        <PreloadQuery
          query={SubmissionsDocument}
          variables={{ contestId: id, sort: SORT[sort], offset: 0, limit: 24 }}
        >
          <ContestPageTemplate id={id} />
        </PreloadQuery>
      </PreloadQuery>
    </PreloadQuery>
  );
}
