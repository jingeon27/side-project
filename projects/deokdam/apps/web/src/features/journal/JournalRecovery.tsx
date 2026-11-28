'use client';

import { useRouter } from 'next/navigation';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';

import { Button } from '@side/design-system/ui/button';
import { toast } from '@side/design-system/ui/sonner';

import { track } from '@/shared/analytics/browser';
import { event } from '@/shared/analytics/events';

import type { TDeokRecord } from './contract';
import {
  changeRecord,
  clearDraft,
  forgetImported,
  journalQuery,
  legacyRecords,
  readDraft,
  type TRecordDraft,
} from './records';

export function JournalRecovery({ account, resume }: { account: string; resume: boolean }) {
  const draft = useQuery({
    queryKey: ['journal-draft', account],
    queryFn: readDraft,
    enabled: resume,
    gcTime: 0,
  });
  const legacy = useQuery({ queryKey: ['legacy-journal', account], queryFn: legacyRecords, gcTime: 0 });
  const cache = useQueryClient();
  const importRecords = useMutation({
    mutationFn: async (records: TDeokRecord[]) => {
      const current = await cache.fetchQuery(journalQuery);
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
      await Promise.all([cache.invalidateQueries({ queryKey: journalQuery.queryKey }), legacy.refetch()]);
    },
  });
  return (
    <>
      {resume && draft.data && <DraftForm account={account} draft={draft.data} />}
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

function DraftForm({ account, draft }: { account: string; draft: TRecordDraft }) {
  const form = useForm({ defaultValues: { note: draft.note } });
  const router = useRouter();
  const cache = useQueryClient();
  const finish = () => {
    clearDraft();
    cache.removeQueries({ queryKey: ['journal-draft', account] });
    router.replace('/journal');
  };
  return (
    <form
      className="reading-panel recovery-panel"
      onSubmit={form.handleSubmit(async ({ note }) => {
        try {
          const saved = await changeRecord(account, 'POST', {
            action: draft.action,
            topic: draft.topic,
            note,
          });
          if (!saved.created) {
            toast.info('이미 오늘의 기록이 있어요. 초안은 여기에 남겨두었어요.');
            return;
          }
          track(event.DeokSaved, {
            topic: draft.topic,
            alternative: draft.alternative,
            episode: draft.episode,
            surface: draft.episode ? 'episode' : 'reading',
          });
          await cache.invalidateQueries({ queryKey: journalQuery.queryKey });
          toast.success('오늘의 덕을 남겼어요.');
          finish();
        } catch {
          toast.error('저장하지 못했어요. 다시 눌러 주세요.');
        }
      })}
    >
      <h2>작성하던 기록</h2>
      <p>{draft.action}</p>
      <label htmlFor="draft-note">남기고 싶은 한 줄</label>
      <textarea id="draft-note" maxLength={240} {...form.register('note')} />
      <div className="order-actions">
        <Button type="submit" loading={form.formState.isSubmitting}>
          내 기록장에 저장
        </Button>
        <Button variant="ghost" type="button" onClick={finish}>
          초안 닫기
        </Button>
      </div>
    </form>
  );
}
