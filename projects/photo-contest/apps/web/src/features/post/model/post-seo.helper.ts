import { match } from 'ts-pattern';

import { PostKind, type GalleryPostCardFragment } from '@/shared/api/generated';
import { siteUrl } from '@/shared/lib/seo.helper';

export function postImageUrls(posts: GalleryPostCardFragment[], origin: string): string[] {
  return posts.flatMap((post) =>
    post.kind === PostKind.Photo && post.mediaUrl ? [siteUrl(post.mediaUrl, origin)] : [],
  );
}

export function postAttachmentJsonLd(post: GalleryPostCardFragment, origin: string) {
  const mediaUrl = post.mediaUrl;
  const media = match(post.kind)
    .with(PostKind.Photo, () => (mediaUrl ? { image: siteUrl(mediaUrl, origin) } : {}))
    .with(PostKind.Video, () =>
      mediaUrl
        ? {
            associatedMedia: {
              '@type': 'MediaObject',
              name: post.title,
              contentUrl: siteUrl(mediaUrl, origin),
            },
          }
        : {},
    )
    .with(PostKind.Link, () => ({}))
    .exhaustive();
  return { ...media, ...(post.linkUrl ? { citation: post.linkUrl } : {}) };
}
