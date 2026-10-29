'use client';

import { useState } from 'react';

import { useFragment } from '@apollo/client/react';
import { ChevronDown, ChevronUp, CornerDownRight } from 'lucide-react';

import { PostCommentCardFragmentDoc } from '@/shared/api/generated';
import { formatCount } from '@/shared/lib/format.helper';
import { Button } from '@/shared/ui/@core/button';

import { PostCommentComposer } from '../PostCommentComposer';
import { PostCommentReplies } from './PostCommentReplies';

export function PostCommentReplySection({ parentId }: { parentId: string }) {
  const { data: comment, complete } = useFragment({
    fragment: PostCommentCardFragmentDoc,
    from: { __typename: 'PostComment', id: parentId },
  });
  const [expanded, setExpanded] = useState(false);
  const [composing, setComposing] = useState(false);
  if (!complete) return null;
  return (
    <div className="ml-11">
      <div className="flex flex-wrap items-center gap-1">
        {comment.canInteract ? (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 px-2 text-micro text-muted"
            aria-expanded={composing}
            onClick={() => setComposing(!composing)}
          >
            <CornerDownRight aria-hidden className="size-3.5" /> 답글 달기
          </Button>
        ) : null}
        {comment.replyCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 px-2 text-micro text-ink"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronUp aria-hidden className="size-3.5" />
            ) : (
              <ChevronDown aria-hidden className="size-3.5" />
            )}
            {expanded ? '답글 접기' : `답글 ${formatCount(comment.replyCount)}개 보기`}
          </Button>
        ) : null}
      </div>
      {composing ? (
        <div className="mt-2 rounded-card border border-line bg-sunken p-3">
          <PostCommentComposer
            postId={comment.postId}
            parentId={parentId}
            onCancel={() => setComposing(false)}
            onCreated={() => {
              setComposing(false);
              setExpanded(true);
            }}
          />
        </div>
      ) : null}
      {expanded && comment.replyCount > 0 ? (
        <div className="mt-3 border-l border-line-strong pb-1 pl-3 desktop:pl-5">
          <PostCommentReplies
            postId={comment.postId}
            parentId={parentId}
            replyToName={comment.author.nickname}
          />
        </div>
      ) : null}
    </div>
  );
}
