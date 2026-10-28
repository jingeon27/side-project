'use client';

import { useRouter } from 'next/navigation';

import { useQueryClient } from '@tanstack/react-query';

import { appRoutes } from '@game-feedback/bridge';

import { useSession } from '@/features/auth';
import { deletePostMutationOptions } from '@/features/post';
import type { Post } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { openOverlay } from '@/shared/ui';
import { EditPostSheet } from '@/widgets/post-composer';

import { BlockAuthorButton } from './BlockAuthorButton';
import { ContentDeleteDialog } from './ContentDeleteDialog';
import { ContentOwnerActions } from './ContentOwnerActions';
import { ReportContentButton } from './ReportContentButton';

export function PostActions({ post }: { post: Post }) {
  const { t, locale } = useI18n();
  const { session } = useSession();
  const client = useQueryClient();
  const router = useRouter();
  if (post.author.id !== session.user?.id)
    return (
      <div className="content-actions">
        <ReportContentButton targetType="POST" targetId={post.id} />
        <BlockAuthorButton author={post.author} postId={post.id} />
      </div>
    );
  return (
    <ContentOwnerActions
      onEdit={() => openOverlay((control) => <EditPostSheet {...control} post={post} />)}
      onDelete={() =>
        openOverlay((control) => (
          <ContentDeleteDialog
            {...control}
            description={t(
              '삭제한 내용은 복구할 수 없어요. 요청을 삭제하면 연결된 피드백과 댓글도 보이지 않게 됩니다.',
            )}
            options={deletePostMutationOptions(client)}
            variables={{ id: post.id }}
            // 지운 글의 기록을 남기지 않아 뒤로 가기가 404 문서를 다시 열지 않는다.
            onDeleted={() => router.replace(appRoutes.feed(locale))}
          />
        ))
      }
    />
  );
}
