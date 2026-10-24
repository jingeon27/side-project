'use client';

import { useRouter } from 'next/navigation';

import { Flag, Pencil, ShieldBan, Trash2 } from 'lucide-react';

import { appRoutes } from '@game-feedback/bridge';

import { useSession } from '@/features/auth';
import type { Author, Post } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { openOverlay, useNotify } from '@/shared/ui';
import { BlockUserDialog, ReportDialog } from '@/widgets/moderation';
import { EditPostSheet } from '@/widgets/post-composer';
import { StartChatLink } from '@/widgets/start-chat';

import { ContentDeleteDialog } from './ContentDeleteDialog';
import { ContentEditDialog } from './ContentEditDialog';

interface IContentActionsProps {
  type: 'POST' | 'ANSWER' | 'COMMENT';
  id: string;
  author: Author;
  body?: string;
  post: Post;
  locale: string;
}
export function ContentActions({ type, id, author, body = '', post, locale }: IContentActionsProps) {
  const { t } = useI18n();
  const { session, login } = useSession(),
    notify = useNotify(),
    router = useRouter(),
    owner = author.id === session?.user?.id;
  if (owner)
    return (
      <div className="content-actions">
        <button
          className="text-action"
          onClick={() =>
            openOverlay(({ isOpen, close, unmount }) => {
              const onOpenChange = (next: boolean) => {
                if (next) return;
                close();
                unmount();
              };
              if (type === 'POST')
                return <EditPostSheet open={isOpen} onOpenChange={onOpenChange} post={post} />;
              return (
                <ContentEditDialog
                  open={isOpen}
                  onOpenChange={onOpenChange}
                  type={type}
                  id={id}
                  body={body}
                />
              );
            })
          }
        >
          <Pencil size={13} />
          {t('수정')}
        </button>
        <button
          className="text-action danger-text"
          onClick={() =>
            openOverlay(({ isOpen, close, unmount }) => (
              <ContentDeleteDialog
                open={isOpen}
                onOpenChange={(next) => {
                  if (next) return;
                  close();
                  unmount();
                }}
                type={type}
                id={id}
                postId={post.id}
                locale={locale}
              />
            ))
          }
        >
          <Trash2 size={13} />
          {t('삭제')}
        </button>
      </div>
    );
  return (
    <div className="content-actions">
      {type !== 'POST' && <StartChatLink source="comment" userId={author.id} nickname={author.nickname} />}
      <button
        className="text-action"
        onClick={() => {
          if (!session?.user) {
            login();
            return;
          }
          openOverlay(({ isOpen, close, unmount }) => (
            <ReportDialog
              open={isOpen}
              onOpenChange={(next) => {
                if (next) return;
                close();
                unmount();
              }}
              targetType={type}
              targetId={id}
            />
          ));
        }}
      >
        <Flag size={13} />
        {t('신고')}
      </button>
      <button
        className="text-action"
        onClick={() => {
          if (!session?.user) {
            login();
            return;
          }
          openOverlay(({ isOpen, close, unmount }) => (
            <BlockUserDialog
              author={author}
              open={isOpen}
              onOpenChange={(next) => {
                if (next) return;
                close();
                unmount();
              }}
              onBlocked={() => {
                notify(t('사용자를 차단했어요. 설정에서 해제할 수 있어요.'));
                if (author.id === post.author.id) router.replace(appRoutes.feed(locale));
              }}
            />
          ));
        }}
      >
        <ShieldBan size={13} />
        {t('차단')}
      </button>
    </div>
  );
}
