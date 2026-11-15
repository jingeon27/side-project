'use client';

import { useCallback, useEffect } from 'react';
import Link from 'next/link';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFieldArray, useForm } from 'react-hook-form';
import { match, P } from 'ts-pattern';
import { z } from 'zod';

import { trackStudioEvent } from '../../lib/analytics';
import { jsonRequest, voiceCatalogQuery, voiceDetailQuery, voiceRequest } from '../../lib/voice-client';
import {
  voiceIdSchema,
  voiceRunInputSchema,
  voiceRunSchema,
  voiceSampleInputSchema,
  voiceSampleSchema,
  type TVoiceRun,
} from '../../lib/voice-training';

const uploadSchema = z.object({
  samples: z
    .array(
      voiceSampleInputSchema.extend({
        clipId: voiceIdSchema,
        file: z
          .instanceof(File)
          .refine((file) => file.size > 0 && file.size <= 10_000_000, '각 파일은 10MB 이하여야 합니다'),
      }),
    )
    .min(1, '녹음을 먼저 선택해 주세요')
    .max(50, '녹음은 최대 50개까지 등록합니다'),
});
const learningSchema = voiceRunInputSchema.required();

export function VoiceLearning({ id }: { id: string }) {
  const client = useQueryClient();
  const detail = useQuery({
    ...voiceDetailQuery(id),
    refetchInterval: (query) =>
      query.state.data?.runs.some((run) => ['PENDING', 'RUNNING'].includes(run.status)) ? 2000 : false,
  });
  const run = detail.data?.runs[0];
  const active = run && ['PENDING', 'RUNNING'].includes(run.status);
  const uploadForm = useForm<z.infer<typeof uploadSchema>>({
    resolver: zodResolver(uploadSchema),
    defaultValues: { samples: [] },
  });
  const clips = useFieldArray({ control: uploadForm.control, name: 'samples' });
  const learningForm = useForm<z.infer<typeof learningSchema>>({
    resolver: zodResolver(learningSchema),
    defaultValues: { epochs: 3 },
  });
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: voiceDetailQuery(id).queryKey });
  };
  const upload = useMutation({
    mutationFn: async (input: z.infer<typeof uploadSchema>) => {
      void trackStudioEvent('studio_request_clicked', { action: 'voice-upload' });
      for (const clip of input.samples) {
        const body = new FormData();
        body.set('file', clip.file);
        body.set('transcript', clip.transcript);
        await voiceRequest(`/api/voices/${id}/samples/${clip.clipId}`, voiceSampleSchema, {
          method: 'PUT',
          body,
        });
      }
    },
    onSuccess: async () => {
      void trackStudioEvent('studio_request_succeeded', { action: 'voice-upload' });
      uploadForm.reset({ samples: [] });
      await refresh();
    },
    onError: refresh,
  });
  const remove = useMutation({
    mutationFn: (sampleId: string) =>
      voiceRequest(`/api/voices/${id}/samples/${sampleId}`, z.null(), { method: 'DELETE' }),
    onSuccess: refresh,
  });
  const train = useMutation({
    mutationFn: (input: z.infer<typeof learningSchema>) => {
      void trackStudioEvent('studio_request_clicked', { action: 'voice-train' });
      return voiceRequest(`/api/voices/${id}/train`, voiceRunSchema, jsonRequest(input));
    },
    onSuccess: async () => {
      void trackStudioEvent('studio_request_succeeded', { action: 'voice-train' });
      await refresh();
    },
  });
  const control = useMutation({
    mutationFn: ({ runId, action }: { runId: string; action: 'resume' | 'cancel' }) => {
      void trackStudioEvent('studio_request_clicked', {
        action: action === 'resume' ? 'voice-resume' : 'voice-cancel',
      });
      return voiceRequest(
        `/api/voice-runs/${runId}`,
        voiceRunSchema,
        action === 'resume' ? jsonRequest({ action }) : { method: 'DELETE' },
      );
    },
    onSuccess: async (_, input) => {
      void trackStudioEvent('studio_request_succeeded', {
        action: input.action === 'resume' ? 'voice-resume' : 'voice-cancel',
      });
      await refresh();
    },
  });
  useEffect(() => {
    if (run?.status === 'SUCCEEDED') void client.invalidateQueries({ queryKey: voiceCatalogQuery.queryKey });
  }, [client, run?.id, run?.status]);
  const pending = upload.isPending || remove.isPending || train.isPending || control.isPending;
  const locked = Boolean(active || pending);
  const unsaved = clips.fields.length > 0;
  const handleFilesChange = (files: FileList | null) => {
    if (!files) return;
    const remaining = Math.max(0, 50 - (detail.data?.samples.length ?? 0) - clips.fields.length);
    if (files.length > remaining) {
      uploadForm.setError('root.files', { message: `녹음은 ${remaining}개 더 선택할 수 있습니다` });
      return;
    }
    uploadForm.clearErrors('root.files');
    clips.append(Array.from(files).map((file) => ({ clipId: crypto.randomUUID(), file, transcript: '' })));
  };
  return (
    <div className="voice-page learning-page">
      <header className="voice-page-header">
        <Link href="/studio/voices">목소리 목록</Link>
        <Link href="/studio">작업실로</Link>
      </header>
      <main className="voice-page-content">
        {detail.isPending && <p role="status">학습 자료를 불러오는 중</p>}
        {detail.error && (
          <p role="alert">
            {detail.error.message}{' '}
            <button className="text-button" onClick={() => void detail.refetch()}>
              다시 불러오기
            </button>
          </p>
        )}
        {detail.data && (
          <>
            <p className="eyebrow">목소리 학습</p>
            <h1>{detail.data.voice.name}</h1>
            <p className="voice-intro">
              같은 사람의 깨끗한 녹음과, 녹음에서 실제로 읽은 대본을 준비해 주세요. 각 파일은 1~30초, 10MB
              이하이며 최소 2개가 필요해요.
            </p>
            {!detail.data.trainingReady && (
              <aside className="voice-setup">
                <strong>학습 모델을 한 번 준비해 주세요</strong>
                <p>
                  프로젝트 폴더에서 아래 명령을 실행하면 공개 모델을 받습니다. API 키 없이 이 컴퓨터에서
                  학습해요.
                </p>
                <code>yarn workspace @story-studio/web local:setup:voice</code>
              </aside>
            )}
            <section className="voice-recordings" aria-labelledby="saved-recordings">
              <div className="voice-section-heading">
                <h2 id="saved-recordings">저장한 녹음</h2>
                <span>{detail.data.samples.length}/50개</span>
              </div>
              {detail.data.samples.length === 0 && <p>녹음을 선택하고 대본을 입력해 주세요</p>}
              {detail.data.samples.map((sample) => (
                <article className="voice-clip" key={sample.id}>
                  <div className="voice-section-heading">
                    <strong>{sample.filename}</strong>
                    <button
                      className="text-button danger"
                      disabled={locked || unsaved}
                      onClick={() => remove.mutate(sample.id)}
                    >
                      삭제
                    </button>
                  </div>
                  <audio
                    controls
                    preload="none"
                    src={sample.asset}
                    aria-label={`${sample.filename} 저장한 녹음`}
                  />
                  <p>{sample.transcript}</p>
                  <small>{sample.duration.toFixed(1)}초</small>
                </article>
              ))}
              {remove.error && <p role="alert">{remove.error.message}</p>}
            </section>
            <form id="voice-upload" onSubmit={uploadForm.handleSubmit((input) => upload.mutate(input))}>
              <fieldset disabled={locked} className="voice-upload-fields">
                <label className="voice-file-picker">
                  <span>녹음 선택</span>
                  <span>여러 파일을 함께 선택할 수 있어요</span>
                  <input
                    className="sr-only"
                    aria-label="녹음 선택"
                    type="file"
                    multiple
                    accept="audio/*,.wav,.mp3,.m4a,.flac,.ogg,.webm"
                    disabled={locked || detail.data.samples.length + clips.fields.length >= 50}
                    onChange={(event) => {
                      handleFilesChange(event.target.files);
                      event.target.value = '';
                    }}
                  />
                </label>
                <p className="fine-print">
                  WAV, MP3, M4A, FLAC, OGG, WebM 지원. 배경 음악과 다른 사람의 말소리가 없는 녹음이 좋아요.
                </p>
                {clips.fields.map((clip, index) => (
                  <article className="voice-clip" key={clip.id}>
                    <div className="voice-section-heading">
                      <strong>{clip.file.name}</strong>
                      <button type="button" className="text-button" onClick={() => clips.remove(index)}>
                        선택 해제
                      </button>
                    </div>
                    <RecordingPreview file={clip.file} />
                    <label htmlFor={`transcript-${clip.clipId}`}>녹음한 대본</label>
                    <textarea
                      id={`transcript-${clip.clipId}`}
                      rows={3}
                      maxLength={2000}
                      placeholder="녹음에서 읽은 말을 그대로 입력해 주세요"
                      {...uploadForm.register(`samples.${index}.transcript`)}
                    />
                    {uploadForm.formState.errors.samples?.[index]?.transcript && (
                      <p role="alert">{uploadForm.formState.errors.samples[index]?.transcript?.message}</p>
                    )}
                    {uploadForm.formState.errors.samples?.[index]?.file && (
                      <p role="alert">{uploadForm.formState.errors.samples[index]?.file?.message}</p>
                    )}
                  </article>
                ))}
              </fieldset>
              {uploadForm.formState.errors.samples?.root && (
                <p role="alert">{uploadForm.formState.errors.samples.root.message}</p>
              )}
              {uploadForm.formState.errors.root?.files && (
                <p role="alert">{uploadForm.formState.errors.root.files.message}</p>
              )}
              {upload.error && (
                <p role="alert">{upload.error.message} 입력한 대본은 유지됩니다. 다시 저장해 주세요.</p>
              )}
            </form>
            <section className="voice-training-settings" aria-labelledby="training-settings">
              <h2 id="training-settings">가중치 학습</h2>
              <p>
                QLoRA 방식으로 약 181만 개의 추가 가중치를 조정합니다. 기본 4비트 모델은 유지하며, 완료한
                목소리는 장면의 음성 메뉴에서 선택할 수 있어요.
              </p>
              <form id="voice-train" onSubmit={learningForm.handleSubmit((input) => train.mutate(input))}>
                <label htmlFor="voice-epochs">전체 녹음 반복 횟수</label>
                <input
                  id="voice-epochs"
                  type="number"
                  min={1}
                  max={20}
                  disabled={locked}
                  {...learningForm.register('epochs', { valueAsNumber: true })}
                />
                {learningForm.formState.errors.epochs && <p role="alert">1~20 사이로 입력해 주세요</p>}
              </form>
              <p className="fine-print">
                반복을 많이 하면 발음이 오히려 나빠질 수 있어요. 3회부터 시작해 결과를 들어보세요. 학습 중에는
                다른 로컬 생성을 잠시 멈춥니다.
              </p>
              {run && <TrainingProgress run={run} />}
              {train.error && <p role="alert">{train.error.message}</p>}
              {control.error && <p role="alert">{control.error.message}</p>}
            </section>
          </>
        )}
      </main>
      {detail.data && (
        <div className="voice-action-bar">
          <div>
            {match({ unsaved, run })
              .with({ unsaved: true }, () => (
                <>
                  <span>선택한 녹음 {clips.fields.length}개</span>
                  <button className="button primary" form="voice-upload" disabled={locked}>
                    {upload.isPending ? '녹음을 저장하는 중' : '녹음과 대본 저장'}
                  </button>
                </>
              ))
              .with({ run: { status: P.union('PENDING', 'RUNNING') } }, ({ run }) => (
                <>
                  <span>학습 중에도 이 화면을 나가도 됩니다</span>
                  <button
                    className="button secondary"
                    disabled={pending}
                    onClick={() => control.mutate({ runId: run.id, action: 'cancel' })}
                  >
                    학습 중단
                  </button>
                </>
              ))
              .otherwise(() => (
                <>
                  <span>
                    {(detail.data?.samples.length ?? 0) < 2
                      ? '녹음을 2개 이상 저장해 주세요'
                      : '학습은 이 컴퓨터에서 실행합니다'}
                  </span>
                  {run && ['FAILED', 'CANCELLED'].includes(run.status) && run.checkpoint && (
                    <button
                      className="button secondary"
                      disabled={pending || !detail.data?.trainingReady}
                      onClick={() => control.mutate({ runId: run.id, action: 'resume' })}
                    >
                      이어서 학습
                    </button>
                  )}
                  <button
                    className="button primary"
                    form="voice-train"
                    disabled={
                      pending || !detail.data?.trainingReady || (detail.data?.samples.length ?? 0) < 2
                    }
                  >
                    {train.isPending ? '학습을 시작하는 중' : '새 학습 시작'}
                  </button>
                </>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RecordingPreview({ file }: { file: File }) {
  const audioRef = useCallback(
    (node: HTMLAudioElement | null) => {
      if (!node) return;
      const url = URL.createObjectURL(file);
      node.src = url;
      return () => {
        node.removeAttribute('src');
        node.load();
        URL.revokeObjectURL(url);
      };
    },
    [file],
  );
  return <audio controls preload="none" ref={audioRef} aria-label={`${file.name} 선택한 녹음`} />;
}
function TrainingProgress({ run }: { run: TVoiceRun }) {
  const label = match(run.status)
    .with('PENDING', () => '학습 준비 중')
    .with('RUNNING', () => '가중치 학습 중')
    .with('SUCCEEDED', () => '학습 완료')
    .with('FAILED', () => '학습 실패')
    .with('CANCELLED', () => '학습 중단됨')
    .exhaustive();
  return (
    <div className="voice-training-progress" role="status">
      <div className="voice-section-heading">
        <strong>{label}</strong>
        <span>
          {run.step}/{run.total}단계
        </span>
      </div>
      <progress value={run.step} max={run.total} aria-label="음성 학습 진행" />
      <p>{run.error || run.progress}</p>
      {run.loss !== undefined && (
        <small>
          손실 {run.loss.toFixed(3)}
          {run.peakMemoryGiB !== undefined && `, 최대 모델 메모리 ${run.peakMemoryGiB.toFixed(1)}GB`}
        </small>
      )}
      {run.status === 'SUCCEEDED' && <Link href="/studio">작업실에서 목소리 사용하기 →</Link>}
    </div>
  );
}
