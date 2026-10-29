import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { match } from 'ts-pattern';

import {
  getGroupContestMetadata,
  getGroupContestSeoData,
  groupContestJsonLd,
  GroupContestPageTemplate,
} from '@/_pages/group-contest';
import { PreloadQuery } from '@/shared/api/apollo-client.server';
import {
  GalleryDocument,
  GalleryPostsDocument,
  GroupContestDocument,
  GroupContestResultsDocument,
  GroupVisibility,
  MeDocument,
  Phase,
  PostSort,
} from '@/shared/api/generated';
import { getWebOrigin } from '@/shared/api/server-request.helper';
import { JsonLd } from '@/shared/ui/@core/json-ld';

interface IPageProps {
  params: Promise<{ id: string; contestId: string }>;
}

export async function generateMetadata({ params }: IPageProps): Promise<Metadata> {
  const { id, contestId } = await params;
  const metadata = await getGroupContestMetadata(id, contestId);
  if (!metadata) notFound();
  return metadata;
}

export default async function Page({ params }: IPageProps) {
  const { id, contestId } = await params;
  const seo = await getGroupContestSeoData(id, contestId);
  if (!seo) notFound();
  const jsonLd = groupContestJsonLd(seo, getWebOrigin());
  return (
    <>
      {jsonLd ? <JsonLd data={jsonLd} /> : null}
      <PreloadQuery query={MeDocument}>
        <PreloadQuery query={GalleryDocument} variables={{ id }} errorPolicy="all">
          {match(seo.group.visibility)
            .with(GroupVisibility.Public, () => {
              const contest = seo.contest;
              if (!contest) notFound();
              return (
                <PreloadQuery query={GroupContestDocument} variables={{ id: contestId }} errorPolicy="all">
                  {match(contest.phase)
                    .with(Phase.Completed, () => (
                      <PreloadQuery
                        query={GroupContestResultsDocument}
                        variables={{ contestId }}
                        errorPolicy="all"
                      >
                        <GroupContestPageTemplate
                          id={contestId}
                          groupId={id}
                          initialTitle={contest.title}
                          resultsPreloaded
                        />
                      </PreloadQuery>
                    ))
                    .with(Phase.Upcoming, Phase.Submission, Phase.Voting, () => (
                      <PreloadQuery
                        query={GalleryPostsDocument}
                        variables={{ groupId: id, contestId, sort: PostSort.Newest, offset: 0, limit: 24 }}
                        errorPolicy="all"
                      >
                        <GroupContestPageTemplate id={contestId} groupId={id} initialTitle={contest.title} />
                      </PreloadQuery>
                    ))
                    .exhaustive()}
                </PreloadQuery>
              );
            })
            .with(GroupVisibility.Private, () => <GroupContestPageTemplate id={contestId} groupId={id} />)
            .exhaustive()}
        </PreloadQuery>
      </PreloadQuery>
    </>
  );
}
