'use client';

import { useRouter } from 'next/navigation';

import { EllipsisVertical, Flag, ShieldBan } from 'lucide-react';

import { appRoutes } from '@game-feedback/bridge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
} from '@side/design-system';

import { useSession } from '@/features/auth';
import type { Author } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { openOverlay, useNotify } from '@/shared/ui';
import { BlockUserDialog, openUserReport } from '@/widgets/moderation';

export function ProfileActionsMenu({ author, locale }: { author: Author; locale: string }) {
  const { t } = useI18n();
  const { session, requireLogin } = useSession();
  const router = useRouter();
  const notify = useNotify();
  if (session.user?.id === author.id) return null;

  const handleReport = () => {
    if (!session.user) {
      requireLogin();
      return;
    }
    openUserReport(author.id);
  };
  const handleBlocked = () => {
    notify(t('사용자를 차단했어요. 설정에서 해제할 수 있어요.'));
    router.replace(appRoutes.feed(locale));
    router.refresh();
  };
  const handleBlock = () => {
    if (!session.user) {
      requireLogin();
      return;
    }
    openOverlay((control) => <BlockUserDialog {...control} author={author} onBlocked={handleBlocked} />);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<IconButton type="button" label={t('{name}님의 프로필 메뉴', { name: author.nickname })} />}
      >
        <EllipsisVertical size={18} aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleReport}>
          <Flag aria-hidden />
          {t('사용자 신고')}
        </DropdownMenuItem>
        <DropdownMenuItem variant="danger" onClick={handleBlock}>
          <ShieldBan aria-hidden />
          {t('사용자 차단')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
