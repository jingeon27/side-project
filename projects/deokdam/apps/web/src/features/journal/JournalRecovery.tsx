'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@side/design-system/ui/button';
import { toast } from '@side/design-system/ui/sonner';

import { track } from '@/shared/analytics/browser';
import { event } from '@/shared/analytics/events';

import type { TDeokRecord } from './contract';
import { changeRecord, forgetImported, journalKey, journalQuery, legacyRecords } from './records';

export function JournalRecovery({ account }: { account: string }) {
  const cache = useQueryClient();
  const legacy = useQuery({ queryKey: ['legacy-journal', account], queryFn: legacyRecords, gcTime: 0 });
  const importRecords = useMutation({
    mutationFn: async (records: TDeokRecord[]) => {
      const current = await cache.fetchQuery(journalQuery(account));
      if (current?.account !== account) throw new Error('account_changed');
      const accepted: TDeokRecord[] = [];
      for (const record of records) {
        const saved = await changeRecord(account, 'PUT', record);
        const match = current.records.find((item) => item.date === record.date);
        if (
          saved.created ||
          (match &&
            match.topic === record.topic &&
            match.action === record.action &&
            match.note === record.note)
        ) {
          forgetImported(record);
          accepted.push(record);
        }
      }
      return accepted.length;
    },
    onSuccess: (count, records) => {
      track(event.JournalImported, { count });
      toast(
        count === records.length
          ? '예전 기록을 가져왔어요.'
          : '같은 날짜의 다른 기록은 이 기기에 남겨뒀어요.',
      );
    },
    onError: () => toast.error('기록 가져오기가 중단됐어요. 남은 기록은 다시 가져올 수 있어요.'),
    onSettled: async () => {
      await Promise.all([cache.invalidateQueries({ queryKey: journalKey }), legacy.refetch()]);
    },
  });
  return (
    <>
      {!!legacy.data?.length && (
        <section className="reading-panel recovery-panel">
          <h2>이 기기의 예전 기록</h2>
          <p>
            이 브라우저에 {legacy.data.length}개의 기록이 있어요. 내 기록이 맞으면 현재 계정에 가져오세요.
          </p>
          <Button
            variant="secondary"
            loading={importRecords.isPending}
            onClick={() => {
              track(event.JournalImportClicked, {});
              importRecords.mutate(legacy.data);
            }}
          >
            내 계정으로 가져오기
          </Button>
        </section>
      )}
    </>
  );
}
