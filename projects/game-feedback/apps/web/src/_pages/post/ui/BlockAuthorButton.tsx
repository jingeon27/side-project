'use client';

import { useRouter } from 'next/navigation';

import { useQueryClient } from '@tanstack/react-query';
import { ShieldBan } from 'lucide-react';

import { appRoutes } from '@game-feedback/bridge';

import { useSession } from '@/features/auth';
import { postDetailOptions } from '@/features/post';
import type { Author } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { openOverlay, useNotify } from '@/shared/ui';
import { BlockUserDialog } from '@/widgets/moderation';

interface IBlockAuthorButtonProps {
  author: Author;
  /** 차단한 사람이 이 게시글 작성자면 글이 보이지 않으므로 피드로 나간다. */
  postId: string;
}

export function BlockAuthorButton({ author, postId }: IBlockAuthorButtonProps) {
  const { t, locale } = useI18n();
  const { session, requireLogin } = useSession();
  const client = useQueryClient();
  const notify = useNotify();
  const router = useRouter();
  function handleBlocked() {
    notify(t('사용자를 차단했어요. 설정에서 해제할 수 있어요.'));
    const detail = client.getQueryData(postDetailOptions(postId).queryKey);
    if (detail?.post.author.id === author.id) router.replace(appRoutes.feed(locale));
  }
  function handleBlock() {
    if (!session.user) {
      requireLogin();
      return;
    }
    openOverlay((control) => <BlockUserDialog {...control} author={author} onBlocked={handleBlocked} />);
  }
  return (
    <button type="button" className="text-action" onClick={handleBlock}>
      <ShieldBan size={13} />
      {t('차단')}
    </button>
  );
}
