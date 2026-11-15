'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { trackStudioEvent } from '../../lib/analytics';
import { jsonRequest, voiceCatalogQuery, voiceRequest } from '../../lib/voice-client';
import { voiceDatasetSchema, voiceNameSchema } from '../../lib/voice-training';

export function VoiceLibrary() {
  const router = useRouter();
  const client = useQueryClient();
  const catalog = useQuery(voiceCatalogQuery);
  const form = useForm<z.infer<typeof voiceNameSchema>>({
    resolver: zodResolver(voiceNameSchema),
    defaultValues: { name: '' },
  });
  const create = useMutation({
    mutationFn: (input: z.infer<typeof voiceNameSchema>) => {
      void trackStudioEvent('studio_request_clicked', { action: 'voice-create' });
      return voiceRequest('/api/voices', voiceDatasetSchema, jsonRequest(input));
    },
    onSuccess: async (voice) => {
      void trackStudioEvent('studio_request_succeeded', { action: 'voice-create' });
      await client.invalidateQueries({ queryKey: voiceCatalogQuery.queryKey });
      router.push(`/studio/voices/${voice.id}`);
    },
  });
  return (
    <div className="voice-page">
      <header className="voice-page-header">
        <Link href="/studio">작업실로</Link>
        <span>목소리 학습</span>
      </header>
      <main className="voice-page-content">
        <p className="eyebrow">로컬 음성 학습</p>
        <h1>이야기에 맞는 목소리</h1>
        <p className="voice-intro">
          한 사람의 여러 녹음과 대본으로 음성 가중치를 학습해요. 녹음과 학습 결과는 이 컴퓨터에 저장됩니다.
        </p>
        <form className="voice-create" onSubmit={form.handleSubmit((input) => create.mutate(input))}>
          <label htmlFor="voice-name">새 목소리 이름</label>
          <div>
            <input
              id="voice-name"
              placeholder="예: 별을 읽어주는 목소리"
              maxLength={60}
              {...form.register('name')}
            />
            <button className="button primary" disabled={create.isPending}>
              {create.isPending ? '만드는 중' : '목소리 만들기'}
            </button>
          </div>
          {form.formState.errors.name && <p role="alert">{form.formState.errors.name.message}</p>}
          {create.error && <p role="alert">{create.error.message}</p>}
        </form>
        <section aria-label="나의 목소리" className="voice-library">
          <h2>나의 목소리</h2>
          {catalog.isPending && <p role="status">목소리를 불러오는 중</p>}
          {catalog.error && (
            <p role="alert">
              {catalog.error.message}{' '}
              <button className="text-button" onClick={() => void catalog.refetch()}>
                다시 불러오기
              </button>
            </p>
          )}
          {catalog.data?.voices.length === 0 && <p>아직 등록한 목소리가 없어요</p>}
          {catalog.data?.voices.map((voice) => (
            <Link className="voice-library-item" href={`/studio/voices/${voice.id}`} key={voice.id}>
              <strong>{voice.name}</strong>
              <span>
                {catalog.data.trained.some((item) => item.voiceId === voice.id) ? '학습 완료' : '녹음 준비'} →
              </span>
            </Link>
          ))}
        </section>
      </main>
    </div>
  );
}
