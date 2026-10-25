import type { ReactNode } from 'react';

export function GroupDiscoveryIntro({ action }: { action?: ReactNode }) {
  return (
    <section className="flex flex-wrap items-end justify-between gap-5 rounded-sheet bg-accent-soft p-5 tablet:p-8">
      <div className="min-w-0">
        <p className="text-label text-accent-ink">취향이 맞는 사람들과</p>
        <h2 className="mt-2 text-display text-ink">웃긴 순간을 함께 나눠요.</h2>
        <p className="mt-3 max-w-app text-body text-muted">
          공개 그룹은 누구나 구경하고, 비공개 그룹은 가입을 신청해요.
        </p>
      </div>
      {action}
    </section>
  );
}
