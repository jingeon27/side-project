import Image from 'next/image';

import { getArticleThumbnail } from '../lib/article-thumbnails';
import type { Article } from '../model/types';

export function ArticleThumbnail({ article }: { article: Pick<Article, 'id' | 'coverImage'> }) {
  const image = getArticleThumbnail(article);
  return (
    <div className={`article-thumbnail${image.fit === 'contain' ? ' article-thumbnail--contain' : ''}`}>
      <Image src={image.src} alt="" fill sizes="(max-width: 700px) 100vw, (max-width: 1000px) 50vw, 420px" />
    </div>
  );
}
