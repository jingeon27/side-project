import { postAttachmentJsonLd, postImageUrls } from '@/features/post';
import {
  GroupVisibility,
  type GalleryPostsQuery,
  type GroupContestAwardFragment,
  type PublicGroupContestSeoQuery,
  type PublicGroupSeoQuery,
} from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { createPageMetadata, SITE_NAME, siteUrl } from '@/shared/lib/seo.helper';

export interface IGroupContestSeoData {
  group: PublicGroupSeoQuery['group'];
  contest: (PublicGroupContestSeoQuery['groupContest'] & { winners: GroupContestAwardFragment[] }) | null;
  posts: GalleryPostsQuery['galleryPosts'];
}

export function groupContestMetadata(data: IGroupContestSeoData, contestId: string, origin: string) {
  const path = ROUTES.GROUP_CONTEST(data.group.id, contestId);
  if (data.group.visibility !== GroupVisibility.Public || !data.contest)
    return createPageMetadata({
      origin,
      path,
      title: '비공개 그룹 대회',
      description: '승인된 그룹 멤버만 대회와 참여작을 볼 수 있습니다.',
      index: false,
      images: [],
    });
  const images = postImageUrls(data.posts, origin).slice(0, 3);
  return createPageMetadata({
    origin,
    path,
    title: `${data.contest.title} · ${data.group.name}`,
    description: `${data.group.name}의 ${data.contest.title}. 사진·동영상 참여작과 대회 일정, 투표 결과를 확인하세요.`,
    ...(images.length ? { images } : {}),
  });
}

export function groupContestJsonLd(data: IGroupContestSeoData, origin: string) {
  if (data.group.visibility !== GroupVisibility.Public || !data.contest) return null;
  const { group, contest, posts } = data;
  const url = siteUrl(ROUTES.GROUP_CONTEST(group.id, contest.id), origin);
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
            name: group.name,
            item: siteUrl(ROUTES.GROUP(group.id), origin),
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: '그룹 대회',
            item: siteUrl(ROUTES.GROUP_CONTESTS(group.id), origin),
          },
          { '@type': 'ListItem', position: 4, name: contest.title, item: url },
        ],
      },
      {
        '@type': 'Event',
        '@id': `${url}#event`,
        name: contest.title,
        url,
        startDate: contest.startsAt,
        endDate: contest.endsAt,
        description: `${group.name}에서 사진·동영상·합성으로 참여하는 온라인 대회입니다.`,
        eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
        location: { '@type': 'VirtualLocation', url },
        ...(postImageUrls(posts, origin).length ? { image: postImageUrls(posts, origin).slice(0, 3) } : {}),
      },
      {
        '@type': 'CollectionPage',
        '@id': url,
        url,
        name: contest.title,
        inLanguage: 'ko-KR',
        about: { '@id': `${url}#event` },
        breadcrumb: { '@id': `${url}#breadcrumb` },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: posts.length,
          itemListElement: posts.map((post, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            item: {
              '@type': 'DiscussionForumPosting',
              '@id': `${url}#post-${post.id}`,
              url: `${url}#post-${post.id}`,
              headline: post.title,
              text: post.body || post.title,
              datePublished: post.createdAt,
              author: { '@type': 'Person', name: post.author.nickname },
              commentCount: post.commentCount,
              ...(contest.winners.some((winner) => winner.post.id === post.id)
                ? { award: `${contest.title} ${contest.winners.length > 1 ? '공동 우승' : '우승'}` }
                : {}),
              ...postAttachmentJsonLd(post, origin),
            },
          })),
        },
      },
    ],
  };
}
