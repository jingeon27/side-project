'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { trackStudioEvent } from '../lib/analytics';
import { materialCatalogQuery, materialRequest } from '../lib/material-client';
import {
  batchMaterials,
  collectionNameSchema,
  materialKey,
  materialSchema,
  splitMaterial,
  type TMaterial,
} from '../lib/materials';

const uploadFormSchema = z.object({
  collection: collectionNameSchema,
  files: z.custom<FileList>().refine((files) => files && files.length > 0),
});
type TUploadForm = z.infer<typeof uploadFormSchema>;
const addedSchema = z.object({ materials: z.array(materialSchema) });

export function MaterialLibrary() {
  const client = useQueryClient();
  const catalog = useQuery(materialCatalogQuery);
  const [progress, setProgress] = useState('');
  const [pendingDelete, setPendingDelete] = useState('');
  const form = useForm<TUploadForm>({
    resolver: zodResolver(uploadFormSchema),
    defaultValues: { collection: '' },
  });
  useEffect(() => {
    void trackStudioEvent('studio_materials_opened', {});
  }, []);
  const add = useMutation({
    mutationFn: async (input: TUploadForm) => {
      void trackStudioEvent('studio_request_clicked', { action: 'material-add' });
      const texts = await Promise.all(
        Array.from(input.files, async (file) =>
          splitMaterial(file.name.replace(/\.[^.]+$/, ''), await file.text()),
        ),
      );
      // A retry after a partial failure uploads only what is still missing.
      const catalog = await client.fetchQuery({ ...materialCatalogQuery, staleTime: 0 });
      const known = new Set(catalog.materials.map(materialKey));
      const batches = batchMaterials(
        texts.flat().filter(
          (document) =>
            !known.has(
              materialKey({
                collection: input.collection,
                title: document.title,
                characters: document.text.length,
              }),
            ),
        ),
      );
      const added = await batches.reduce<Promise<number>>(async (previous, documents, index) => {
        const count = await previous;
        setProgress(`${batches.length}개 묶음 중 ${index + 1}번째 색인 중`);
        const result = await materialRequest('/api/materials', addedSchema, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ collection: input.collection, documents }),
        });
        return count + result.materials.length;
      }, Promise.resolve(0));
      return { added, skipped: texts.flat().length - batches.flat().length };
    },
    onSuccess: () => {
      void trackStudioEvent('studio_request_succeeded', { action: 'material-add' });
      form.resetField('files');
    },
    onSettled: async () => {
      setProgress('');
      await client.invalidateQueries({ queryKey: materialCatalogQuery.queryKey });
    },
  });
  const remove = useMutation({
    mutationFn: (material: TMaterial) => {
      void trackStudioEvent('studio_request_clicked', { action: 'material-delete' });
      return materialRequest(`/api/materials/${material.id}`, z.object({ id: z.string() }), {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      void trackStudioEvent('studio_request_succeeded', { action: 'material-delete' });
    },
    onSettled: async () => {
      setPendingDelete('');
      await client.invalidateQueries({ queryKey: materialCatalogQuery.queryKey });
    },
  });
  const materials = catalog.data?.materials ?? [];
  const collections = [...new Set(materials.map((material) => material.collection))].sort((first, second) =>
    first.localeCompare(second, 'ko'),
  );
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
          설정집, 취재 메모, 문체 참고 글을 묶음으로 올려 두면 원고를 쓸 때 관련된 부분만 찾아 참고해요.
          자료와 검색 색인은 이 컴퓨터에만 저장됩니다.
        </p>
        {catalog.data && !catalog.data.ready && (
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
            {collections.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <label htmlFor="material-files">텍스트 파일 (.txt, .md)</label>
          <input
            id="material-files"
            type="file"
            multiple
            accept=".txt,.md,text/plain,text/markdown"
            {...form.register('files')}
          />
          <button className="button primary" disabled={add.isPending || catalog.data?.ready === false}>
            {add.isPending ? '색인 중' : '자료 추가'}
          </button>
          {(form.formState.errors.collection || form.formState.errors.files) && (
            <p role="alert">묶음 이름은 한글, 영문, 숫자로 40자까지 쓰고 파일을 하나 이상 선택해 주세요.</p>
          )}
          {progress && <p role="status">{progress}</p>}
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
        <section aria-label="등록한 자료" className="voice-library">
          <h2>등록한 자료</h2>
          {catalog.isPending && <p role="status">자료를 불러오는 중</p>}
          {catalog.error && (
            <p role="alert">
              {catalog.error.message}{' '}
              <button className="text-button" onClick={() => void catalog.refetch()}>
                다시 불러오기
              </button>
            </p>
          )}
          {catalog.data && materials.length === 0 && <p>아직 등록한 자료가 없어요</p>}
          {remove.error && <p role="alert">{remove.error.message}</p>}
          {collections.map((name) => {
            const items = materials.filter((material) => material.collection === name);
            return (
              <details className="material-collection" key={name} open={collections.length === 1}>
                <summary>
                  <strong>{name}</strong>
                  <span>자료 {items.length}개</span>
                </summary>
                {items.map((material) => (
                  <div className="voice-library-item" key={material.id}>
                    <strong>{material.title}</strong>
                    <span>
                      {material.characters.toLocaleString('ko-KR')}자, 검색 단위 {material.passages}개{' '}
                      <button
                        className="text-button danger"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (pendingDelete !== material.id) {
                            setPendingDelete(material.id);
                            return;
                          }
                          remove.mutate(material);
                        }}
                      >
                        {pendingDelete === material.id ? '한 번 더 눌러 삭제' : '삭제'}
                      </button>
                    </span>
                  </div>
                ))}
              </details>
            );
          })}
        </section>
      </main>
    </div>
  );
}
