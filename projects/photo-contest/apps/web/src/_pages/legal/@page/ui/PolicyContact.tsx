import { POLICY } from '../model/policy';

export function PolicyContact() {
  return (
    <dl className="grid gap-3 rounded-card border border-line bg-sunken p-4 text-body">
      <div className="grid gap-1 tablet:grid-cols-[14rem_minmax(0,1fr)] tablet:items-baseline tablet:gap-x-6">
        <dt className="text-muted">운영자 및 개인정보 문의 담당자</dt>
        <dd className="text-ink">{POLICY.operatorName}</dd>
      </div>
      <div className="grid gap-1 tablet:grid-cols-[14rem_minmax(0,1fr)] tablet:items-baseline tablet:gap-x-6">
        <dt className="text-muted">이메일</dt>
        <dd className="min-w-0 break-all">
          <a
            href={`mailto:${POLICY.contactEmail}`}
            className="inline-flex min-h-touch items-center text-ink underline underline-offset-4 active:opacity-60"
          >
            {POLICY.contactEmail}
          </a>
        </dd>
      </div>
    </dl>
  );
}
