'use client';
import { useRouter } from 'next/navigation';
import { Flag, Pencil, Trash2, ShieldBan } from 'lucide-react';
import { useSession } from '@/features/auth';
import { StartChatLink } from '@/widgets/start-chat';
import { PostComposer } from '@/widgets/post-composer';
import { BlockUserDialog } from '@/widgets/moderation';
import type { Author, Post } from '@/shared/api';
import { openOverlay, useNotify } from '@/shared/ui';
import { ContentEditDialog } from './ContentEditDialog';
import { ContentDeleteDialog } from './ContentDeleteDialog';
import { ReportDialog } from './ReportDialog';
interface IContentActionsProps {
  type: 'POST' | 'ANSWER' | 'COMMENT';
  id: string;
  author: Author;
  body?: string;
  post: Post;
  locale: string;
}
export function ContentActions({ type, id, author, body = '', post, locale }: IContentActionsProps) {
  const { session, login } = useSession(),
    notify = useNotify(),
    router = useRouter(),
    owner = author.id === session?.user?.id;
  if (owner)
    return (
      <div className="content-actions">
        <button
          className="text-button"
          onClick={() =>
            openOverlay(({ isOpen, close, unmount }) => {
              const onOpenChange = (next: boolean) => {
                if (next) return;
                close();
                unmount();
              };
              if (type === 'POST')
                return <PostComposer open={isOpen} onOpenChange={onOpenChange} post={post} locale={locale} />;
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
          수정
        </button>
        <button
          className="text-button danger-text"
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
          삭제
        </button>
      </div>
    );
  return (
    <div className="content-actions">
      <StartChatLink userId={author.id} nickname={author.nickname} />
      <button
        className="text-button"
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
        신고
      </button>
      <button
        className="text-button"
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
                notify('사용자를 차단했어요. 설정에서 해제할 수 있어요.');
                if (author.id === post.author.id) router.push(`/${locale}`);
              }}
            />
          ));
        }}
      >
        <ShieldBan size={13} />
        차단
      </button>
    </div>
  );
}
