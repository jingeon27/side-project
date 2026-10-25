import type { ReactNode } from 'react';

export function GroupDiscoveryIntro({ action }: { action?: ReactNode }) {
  return (
    <section className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-title-lg text-ink tablet:text-display">취향이 맞는 사람들과</h2>
        <p className="mt-2 max-w-app text-caption text-muted">
          공개 그룹은 누구나 구경하고, 비공개 그룹은 가입을 신청해요.
        </p>
      </div>
      {action}
    </section>
  );
}
