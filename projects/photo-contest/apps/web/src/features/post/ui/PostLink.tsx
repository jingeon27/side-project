'use client';

import { useFragment } from '@apollo/client/react';
import { Copy, ExternalLink, Link2, Play } from 'lucide-react';
import { useState } from 'react';
import { GalleryPostCardFragmentDoc } from '@/shared/api/generated';
import { useBridge, useExternalLink, useShareLink } from '@/shared/model/bridge';
import { toast } from '@/shared/model/toast';
import { Button } from '@/shared/ui/@core/button';
import { validPostLink, youtubeVideoId } from '../model/post-link.helper';

export function PostLink({ postId }: { postId: string }) {
  const { data: post, complete } = useFragment({
    fragment: GalleryPostCardFragmentDoc,
    from: { __typename: 'GalleryPost', id: postId },
  });
  const bridge = useBridge();
  const external = useExternalLink();
  const share = useShareLink();
  const [showPlayer, setShowPlayer] = useState(false);
  if (!complete || !post.linkUrl || !validPostLink(post.linkUrl)) return null;
  const url = post.linkUrl;
  const hostname = new URL(url).hostname;
  const videoId = youtubeVideoId(url);
  return (
    <div className="mt-3 min-w-0 overflow-hidden rounded-card border border-line bg-sunken">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer ugc"
        aria-label={`${videoId ? '유튜브 영상' : '첨부 링크'} 열기: ${hostname}`}
        className="flex min-h-touch min-w-0 items-center gap-3 p-4 text-ink hover:bg-neutral-soft"
        onClick={(event) => {
          if (!bridge?.supports('link.open')) return;
          event.preventDefault();
          void external.open(url);
        }}
      >
        {videoId ? (
          <Play aria-hidden className="size-5 shrink-0" />
        ) : (
          <Link2 aria-hidden className="size-5 shrink-0" />
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-label">{videoId ? 'YouTube' : hostname}</span>
          <span className="truncate text-caption text-muted">{url}</span>
        </span>
        <ExternalLink aria-hidden className="size-4 shrink-0 text-muted" />
      </a>
      <div className="flex flex-wrap gap-2 px-3 pb-3">
        {videoId && !showPlayer ? (
          <Button variant="secondary" size="md" onClick={() => setShowPlayer(true)}>
            <Play aria-hidden className="size-4" /> 영상 재생
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="md"
          aria-label={`${post.title} 첨부 링크 복사`}
          onClick={async () => {
            const copied = await share.copy(url);
            if (copied) toast.success('링크를 복사했어요');
            if (!copied) toast.error('링크를 복사하지 못했어요');
          }}
        >
          <Copy aria-hidden className="size-4" /> 링크 복사
        </Button>
      </div>
      {videoId && showPlayer ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
          title={`${post.title} 유튜브 영상`}
          className="aspect-video w-full border-0"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation"
          allowFullScreen
        />
      ) : null}
    </div>
  );
}
