'use client';
import { useI18n } from '@/shared/i18n';
import Link from 'next/link';
import type { Author } from '@/shared/api';
import { appRoutes } from '@game-feedback/bridge';
export function AuthorLink({ author, locale }: { author: Author; locale: string }) {
  const { t } = useI18n();
  return (
    <Link
      className="author-profile-link"
      href={appRoutes.profile(locale, author.id)}
      aria-label={t('{name} 프로필', { name: author.nickname })}
    >
      {author.nickname}
    </Link>
  );
}
