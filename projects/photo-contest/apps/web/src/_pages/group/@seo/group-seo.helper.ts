import { postAttachmentJsonLd, postImageUrls } from '@/features/post';
import { GroupVisibility } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { createPageMetadata, SITE_NAME, siteUrl } from '@/shared/lib/seo.helper';

import type { IGroupSeoData } from './group-seo.type';

export function groupMetadata(data: IGroupSeoData, origin: string) {
  const { group, posts } = data;
  const path = ROUTES.GROUP(group.id);
  if (group.visibility !== GroupVisibility.Public)
    return createPageMetadata({
      origin,
      path,
      title: '비공개 그룹',
      description: '그룹장의 수락을 받은 멤버만 게시물을 볼 수 있는 비공개 그룹입니다.',
      index: false,
      images: [],
    });
  const images = [
    ...(group.avatarUrl ? [siteUrl(group.avatarUrl, origin)] : []),
    ...postImageUrls(posts, origin),
  ].slice(0, 3);
  return createPageMetadata({
    origin,
    path,
    title: group.name,
    description:
      group.description ||
      `${group.name}에서 ${group.memberCount}명의 멤버와 사진이나 동영상으로 웃긴 순간을 나눠보세요. 합성한 이미지도 올릴 수 있어요. 누구나 둘러보고 가입할 수 있는 공개 그룹입니다.`,
    ...(images.length ? { images } : {}),
  });
}

export function groupJsonLd(data: IGroupSeoData, origin: string) {
  const { group, posts } = data;
  if (group.visibility !== GroupVisibility.Public) return null;
  const url = siteUrl(ROUTES.GROUP(group.id), origin);
  const websiteId = siteUrl('/#website', origin);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': websiteId,
        name: SITE_NAME,
        url: siteUrl(ROUTES.HOME, origin),
        inLanguage: 'ko-KR',
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: SITE_NAME, item: siteUrl(ROUTES.HOME, origin) },
          { '@type': 'ListItem', position: 2, name: '그룹 탐색', item: siteUrl(ROUTES.EXPLORE, origin) },
          { '@type': 'ListItem', position: 3, name: group.name, item: url },
        ],
      },
      {
        '@type': 'CollectionPage',
        '@id': url,
        url,
        name: group.name,
        ...(group.description ? { description: group.description } : {}),
        ...(group.avatarUrl ? { image: siteUrl(group.avatarUrl, origin) } : {}),
        inLanguage: 'ko-KR',
        isPartOf: { '@id': websiteId },
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
              isPartOf: { '@id': url },
              commentCount: post.commentCount,
              interactionStatistic: {
                '@type': 'InteractionCounter',
                interactionType: 'https://schema.org/LikeAction',
                userInteractionCount: post.likeCount,
              },
              ...postAttachmentJsonLd(post, origin),
            },
          })),
        },
      },
    ],
  };
}
