'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { trackStudioEvent, type TStudioAction } from '../lib/analytics';
import { materialAction, materialOverviewQuery, materialRequest } from '../lib/material-client';
import {
  batchMaterials,
  collectionNameSchema,
  materialChangeSchema,
  materialLimits,
  materialRoles,
  splitMaterial,
  type TMaterialRole,
} from '../lib/materials';
import { MaterialCollection } from './MaterialCollection';

const uploadFormSchema = z.object({
  collection: collectionNameSchema,
  role: z.custom<TMaterialRole>(),
  files: z.custom<FileList>().refine((files) => files && files.length > 0),
});
type TUploadForm = z.infer<typeof uploadFormSchema>;
type TControl = Extract<TStudioAction, 'material-import' | 'material-sync' | 'material-stop'>;
const controls = {
  'material-import': 'import',
  'material-sync': 'sync',
  'material-stop': 'stop',
} as const satisfies Record<TControl, string>;

export function MaterialLibrary() {
  const client = useQueryClient();
  // While the engine indexes, the overview is read again every two seconds to show progress.
  const overview = useQuery({
    ...materialOverviewQuery,
    refetchInterval: (query) => (query.state.data?.sync.running ? 2000 : false),
  });
  const [opened, setOpened] = useState<string[]>([]);
  const form = useForm<TUploadForm>({
    resolver: zodResolver(uploadFormSchema),
    defaultValues: { collection: '', role: 'search' },
  });
  useEffect(() => {
    void trackStudioEvent('studio_materials_opened', {});
  }, []);
  const refresh = () => client.invalidateQueries({ queryKey: materialOverviewQuery.queryKey });
  const add = useMutation({
    mutationFn: async (input: TUploadForm) => {
      void trackStudioEvent('studio_request_clicked', { action: 'material-add' });
      const documents = await Promise.all(
        Array.from(input.files, async (file) =>
          splitMaterial(file.name.replace(/\.[^.]+$/, ''), await file.text()),
        ),
      );
      if (
        input.role === 'always' &&
        documents.flat().some((document) => document.text.length > materialLimits.alwaysCharacters)
      )
        throw new Error(
          '항상 포함할 자료는 6천 자 이하만 올릴 수 있어요. 긴 자료는 관련 부분 검색으로 올려 주세요.',
        );
      // Each request stays small; the server skips documents it already has, so a retry adds only the rest.
      return batchMaterials(documents.flat()).reduce<Promise<z.infer<typeof materialChangeSchema>>>(
        async (previous, batch) => {
          const total = await previous;
          const result = await materialRequest(
            '/api/materials',
            materialChangeSchema,
            materialAction({
              action: 'upload',
              upload: { collection: input.collection, role: input.role, documents: batch },
            }),
          );
          return { added: total.added + result.added, skipped: total.skipped + result.skipped };
        },
        Promise.resolve({ added: 0, skipped: 0 }),
      );
    },
    onSuccess: () => {
      void trackStudioEvent('studio_request_succeeded', { action: 'material-add' });
      form.resetField('files');
    },
    onSettled: refresh,
  });
  const control = useMutation({
    mutationFn: (action: TControl) => {
      void trackStudioEvent('studio_request_clicked', { action });
      return materialRequest('/api/materials', z.unknown(), materialAction({ action: controls[action] }));
    },
    onSuccess: (_result, action) => {
      void trackStudioEvent('studio_request_succeeded', { action });
    },
    onSettled: refresh,
  });
  const data = overview.data;
  const pending = data?.collections.reduce((sum, collection) => sum + collection.pending, 0) ?? 0;
  return (
    <div className="voice-page">
      <header className="voice-page-header">
        <Link href="/studio">작업실로</Link>
        <span>참고 자료실</span>
      </header>
      <main className="voice-page-content">
        <p className="eyebrow">로컬 자료 검색</p>
        <h1>이야기가 참고할 자료</h1>
        <p className="voice-intro">
          설정집, 취재 메모, 문체 참고 글을 묶음으로 올려 두면 원고를 쓸 때 필요한 부분을 골라 참고해요.
          자료와 검색 색인은 이 컴퓨터에만 저장됩니다.
        </p>
        {data && !data.ready && (
          <p role="alert">
            참고 자료 검색 모델이 아직 없습니다. 로컬 설치 명령을 다시 실행하면 준비됩니다.{' '}
            <code>yarn workspace @side/story-studio local:setup</code>
          </p>
        )}
        <form className="material-upload" onSubmit={form.handleSubmit((input) => add.mutate(input))}>
          <label htmlFor="material-collection">묶음 이름</label>
          <input
            id="material-collection"
            placeholder="예: 무협 설정, 베네수엘라 취재"
            maxLength={40}
            list="material-collections"
            {...form.register('collection')}
          />
          <datalist id="material-collections">
            {data?.collections.map((collection) => (
              <option key={collection.name} value={collection.name} />
            ))}
          </datalist>
          <label htmlFor="material-role">원고에 넣는 방식</label>
          <select id="material-role" {...form.register('role')}>
            {materialRoles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}, {role.description}
              </option>
            ))}
          </select>
          <label htmlFor="material-files">텍스트 파일 (.txt, .md)</label>
          <input
            id="material-files"
            type="file"
            multiple
            accept=".txt,.md,text/plain,text/markdown"
            {...form.register('files')}
          />
          <button className="button primary" disabled={add.isPending}>
            {add.isPending ? '올리는 중' : '자료 추가'}
          </button>
          {(form.formState.errors.collection || form.formState.errors.files) && (
            <p role="alert">묶음 이름은 한글, 영문, 숫자로 40자까지 쓰고 파일을 하나 이상 선택해 주세요.</p>
          )}
          {add.error && (
            <p role="alert">{add.error.message} 같은 파일을 다시 선택하면 저장되지 않은 자료만 올립니다.</p>
          )}
          {add.data && (
            <p role="status">
              자료 {add.data.added}개를 추가했습니다.
              {add.data.skipped > 0 && ` 이미 있는 자료 ${add.data.skipped}개는 건너뛰었습니다.`}
            </p>
          )}
        </form>
        <section aria-label="폴더에서 가져오기" className="material-inbox">
          <h2>폴더에서 가져오기</h2>
          <p>
            파일이 많으면 아래 폴더 안에 묶음 이름으로 폴더를 만들고 텍스트 파일을 넣은 뒤 가져오세요. 관련
            부분 검색 자료로 등록하며, 이미 등록한 파일은 건너뜁니다.
          </p>
          {data && <code>{data.inbox}</code>}
          <button
            className="button secondary small"
            disabled={control.isPending}
            onClick={() => control.mutate('material-import')}
          >
            폴더에서 가져오기
          </button>
        </section>
        <section aria-label="색인 상태" className="material-sync">
          {data?.sync.running && (
            <p role="status">
              {data.sync.progress || '색인하는 중'}{' '}
              <button className="text-button" onClick={() => control.mutate('material-stop')}>
                색인 중단
              </button>
            </p>
          )}
          {data && !data.sync.running && data.sync.error && <p role="alert">{data.sync.error}</p>}
          {data && !data.sync.running && pending > 0 && (
            <p>
              아직 색인하지 않은 자료가 {pending}개 있습니다. 색인한 자료만 원고에 쓰입니다.{' '}
              <button
                className="text-button"
                disabled={control.isPending || !data.ready}
                onClick={() => control.mutate('material-sync')}
              >
                색인 시작
              </button>
            </p>
          )}
          {control.error && <p role="alert">{control.error.message}</p>}
        </section>
        <section aria-label="등록한 자료" className="voice-library">
          <h2>등록한 자료</h2>
          {overview.isPending && <p role="status">자료를 불러오는 중</p>}
          {overview.error && (
            <p role="alert">
              {overview.error.message}{' '}
              <button className="text-button" onClick={() => void overview.refetch()}>
                다시 불러오기
              </button>
            </p>
          )}
          {data?.collections.length === 0 && <p>아직 등록한 자료가 없어요</p>}
          {data?.collections.map((collection) => (
            <details
              className="material-collection"
              key={collection.name}
              onToggle={(event) => {
                const open = event.currentTarget.open;
                setOpened((current) =>
                  open
                    ? [...current.filter((name) => name !== collection.name), collection.name]
                    : current.filter((name) => name !== collection.name),
                );
              }}
            >
              <summary>
                <strong>{collection.name}</strong>
                <span>
                  자료 {collection.documents}개
                  {collection.pending > 0 && `, 색인 대기 ${collection.pending}개`}
                </span>
              </summary>
              {opened.includes(collection.name) && <MaterialCollection name={collection.name} />}
            </details>
          ))}
        </section>
      </main>
    </div>
  );
}
