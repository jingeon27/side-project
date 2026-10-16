import Link from 'next/link';
import type { Author } from '@/shared/api';
export function AuthorLink({ author, locale }: { author: Author; locale: string }) {
  return (
    <Link
      className="author-profile-link"
      href={`/${locale}/users/${encodeURIComponent(author.id)}`}
      aria-label={`${author.nickname} 프로필`}
    >
      {author.nickname}
    </Link>
  );
}
