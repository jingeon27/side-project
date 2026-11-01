'use client';

import type { ReactNode } from 'react';

import { ROUTES } from '@/shared/constants/routes';
import { LegalLinks } from '@/shared/ui/@core/legal-links';
import { TopAppBar } from '@/shared/ui/@core/top-app-bar';

import { POLICY } from '../model/policy';

export function LegalPageLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <TopAppBar title={title} backHref={ROUTES.HOME} />
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8 tablet:px-8 tablet:py-12">
        <header className="flex flex-col gap-3 border-b border-line pb-6">
          <p className="flex flex-wrap gap-x-3 text-caption text-muted">
            <time dateTime={POLICY.updatedAt}>최종 수정 {POLICY.updatedLabel}</time>
          </p>
        </header>
        <article aria-label={`${title} 본문`} className="flex flex-col gap-8">
          {children}
        </article>
        <footer className="border-t border-line pt-4">
          <LegalLinks />
        </footer>
      </div>
    </div>
  );
}
