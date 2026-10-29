'use client';

import { Search } from 'lucide-react';

import { iconButtonVariants } from '@side/design-system';

import { useI18n } from '@/shared/i18n';
import { TabLink } from '@/shared/navigation';

export function TopbarSearch({ href }: { href: string }) {
  const { t } = useI18n();
  return (
    <TabLink href={href} className={iconButtonVariants()} aria-label={t('검색')}>
      <Search className="size-5" aria-hidden />
    </TabLink>
  );
}
