'use client';

import { useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { trackStudioEvent } from '../../../shared/analytics';
import {
  materialAction,
  materialListQuery,
  materialOverviewQuery,
  materialRequest,
} from '../api/material-client';
import { materialRoles } from '../model/materials';

const deletedSchema = z.object({ deleted: z.number().int() });

// The documents of one collection, loaded only while the collection is open.
export function MaterialCollection({ name }: { name: string }) {
  const client = useQueryClient();
  const list = useQuery(materialListQuery(name));
  // What a first press marked for deletion: a document id, or the collection itself.
  const [marked, setMarked] = useState('');
  const remove = useMutation({
    mutationFn: (target: { id: string } | { collection: string }) => {
      void trackStudioEvent('studio_request_clicked', { action: 'material-delete' });
      return 'id' in target
        ? materialRequest(`/api/materials/${target.id}`, deletedSchema, { method: 'DELETE' })
        : materialRequest(
            '/api/materials',
            deletedSchema,
            materialAction({ action: 'delete-collection', collection: target.collection }),
          );
    },
    onSuccess: () => {
      void trackStudioEvent('studio_request_succeeded', { action: 'material-delete' });
    },
    onSettled: async () => {
      setMarked('');
      await client.invalidateQueries({ queryKey: materialOverviewQuery.queryKey });
    },
  });
  const confirm = (key: string, target: { id: string } | { collection: string }) => {
    if (marked !== key) {
      setMarked(key);
      return;
    }
    remove.mutate(target);
  };
  return (
    <>
      {list.isPending && <p role="status">자료를 불러오는 중</p>}
      {list.error && <p role="alert">{list.error.message}</p>}
      {remove.error && <p role="alert">{remove.error.message}</p>}
      {list.data?.materials.map((material) => (
        <div className="voice-library-item" key={material.id}>
          <strong>{material.title}</strong>
          <span>
            {materialRoles.find((role) => role.id === material.role)?.name},{' '}
            {material.characters.toLocaleString('ko-KR')}자,{' '}
            {material.passages === undefined ? '색인 대기' : `검색 단위 ${material.passages}개`}{' '}
            <button
              className="text-button danger"
              disabled={remove.isPending}
              onClick={() => confirm(material.id, { id: material.id })}
            >
              {marked === material.id ? '한 번 더 눌러 삭제' : '삭제'}
            </button>
          </span>
        </div>
      ))}
      {list.data && list.data.total > list.data.materials.length && (
        <p className="fine-print">
          최근 {list.data.materials.length}개만 표시합니다. 이 묶음에는 자료가 {list.data.total}개 있습니다.
        </p>
      )}
      <button
        className="text-button danger"
        disabled={remove.isPending}
        onClick={() => confirm('collection', { collection: name })}
      >
        {marked === 'collection' ? '묶음의 자료를 모두 삭제할까요? 한 번 더 눌러 확인' : '이 묶음 삭제'}
      </button>
    </>
  );
}
