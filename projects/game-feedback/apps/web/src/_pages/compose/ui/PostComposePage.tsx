'use client';

import { ArrowLeft } from 'lucide-react';

import type { TBattleMode, TBoardKind, TCoachingRole } from '@game-feedback/contracts';
import { Button } from '@side/design-system';

import { useSession } from '@/features/auth';
import type { Category } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { BackLink } from '@/shared/navigation';
import { AsyncBoundary } from '@/shared/ui';

import { CreatePostForm } from './CreatePostForm';

interface IPostComposePageProps {
  locale: string;
  categories: Category[];
  board: TBoardKind;
  categoryId?: string;
  battleMode?: TBattleMode;
  coachingRole?: TCoachingRole;
  parent: string;
}

export function PostComposePage(props: IPostComposePageProps) {
  const { t } = useI18n();
  return (
    <section className="post-compose-page">
      <div className="compose-heading">
        <BackLink
          href={props.parent}
          logicalParent={props.parent}
          className="compose-back"
          aria-label={t('돌아가기')}
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </BackLink>
        <h1>{t('글쓰기')}</h1>
      </div>
      <AsyncBoundary clientOnly title={t('글쓰기')}>
        <ComposeContent {...props} />
      </AsyncBoundary>
    </section>
  );
}

function ComposeContent({
  locale,
  categories,
  board,
  categoryId,
  battleMode,
  coachingRole,
}: IPostComposePageProps) {
  const { t } = useI18n();
  const { session, login: handleLogin } = useSession();
  if (!session.user)
    return (
      <div className="compose-login">
        <p>{t('로그인하고 글을 작성해보세요.')}</p>
        <Button variant="accent" type="button" onClick={handleLogin}>
          {t('로그인 / 시작하기')}
        </Button>
      </div>
    );
  return (
    <CreatePostForm
      key={`${session.user.id}:${locale}:${board}:${categoryId ?? ''}:${battleMode ?? ''}:${coachingRole ?? ''}`}
      categories={categories}
      locale={locale}
      board={board}
      initialCategoryId={categoryId}
      initialBattleMode={battleMode}
      initialCoachingRole={coachingRole}
    />
  );
}
