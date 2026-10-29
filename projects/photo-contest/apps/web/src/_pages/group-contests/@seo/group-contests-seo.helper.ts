import { postAttachmentJsonLd, postImageUrls } from '@/features/post';
import { GroupVisibility, type GroupContestsQuery, type PublicGroupSeoQuery } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { createPageMetadata, SITE_NAME, siteUrl } from '@/shared/lib/seo.helper';

export interface IGroupContestsSeoData {
  group: PublicGroupSeoQuery['group'];
  contests: GroupContestsQuery['groupContests'];
}

export function groupContestsMetadata(data: IGroupContestsSeoData, hallOfFame: boolean, origin: string) {
  const path = hallOfFame ? ROUTES.GROUP_HALL_OF_FAME(data.group.id) : ROUTES.GROUP_CONTESTS(data.group.id);
  if (data.group.visibility !== GroupVisibility.Public)
    return createPageMetadata({
      origin,
      path,
      title: '비공개 그룹 대회',
      description: '승인된 그룹 멤버만 대회와 명예의 전당을 볼 수 있습니다.',
      index: false,
      images: [],
    });
  const images = postImageUrls(
    data.contests.flatMap((contest) => contest.winners.map(({ post }) => post)),
    origin,
  ).slice(0, 3);
  return createPageMetadata({
    origin,
    path,
    title: `${data.group.name} - ${hallOfFame ? '명예의 전당' : '그룹 대회'}`,
    description: hallOfFame
      ? `${data.group.name}에서 함께 뽑은 지난 대회 우승작과 최종 결과를 만나보세요.`
      : `${data.group.name}에서 열리는 대회를 둘러보고, 사진이나 동영상으로 참여해 보세요.`,
    ...(images.length ? { images } : {}),
  });
}

export function groupContestsJsonLd(data: IGroupContestsSeoData, hallOfFame: boolean, origin: string) {
  if (data.group.visibility !== GroupVisibility.Public) return null;
  const path = hallOfFame ? ROUTES.GROUP_HALL_OF_FAME(data.group.id) : ROUTES.GROUP_CONTESTS(data.group.id);
  const url = siteUrl(path, origin);
  const title = hallOfFame ? '명예의 전당' : '그룹 대회';
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: SITE_NAME, item: siteUrl(ROUTES.HOME, origin) },
          {
            '@type': 'ListItem',
            position: 2,
            name: data.group.name,
            item: siteUrl(ROUTES.GROUP(data.group.id), origin),
          },
          { '@type': 'ListItem', position: 3, name: title, item: url },
        ],
      },
      {
        '@type': 'CollectionPage',
        '@id': url,
        url,
        name: `${data.group.name} - ${title}`,
        inLanguage: 'ko-KR',
        breadcrumb: { '@id': `${url}#breadcrumb` },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: data.contests.length,
          itemListElement: data.contests.map((contest, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            item: {
              '@type': 'Event',
              name: contest.title,
              url: siteUrl(ROUTES.GROUP_CONTEST(data.group.id, contest.id), origin),
              startDate: contest.startsAt,
              endDate: contest.endsAt,
              eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
              location: {
                '@type': 'VirtualLocation',
                url: siteUrl(ROUTES.GROUP_CONTEST(data.group.id, contest.id), origin),
              },
              workFeatured: contest.winners.map(({ post }) => ({
                '@type': 'CreativeWork',
                name: post.title,
                url: `${siteUrl(ROUTES.GROUP_CONTEST(data.group.id, contest.id), origin)}#post-${post.id}`,
                author: { '@type': 'Person', name: post.author.nickname },
                ...postAttachmentJsonLd(post, origin),
              })),
            },
          })),
        },
      },
    ],
  };
}
