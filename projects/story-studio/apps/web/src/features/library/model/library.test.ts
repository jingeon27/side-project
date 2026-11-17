import { expect, it } from 'vitest';

import { sampleProject } from '../../story/model/sample';
import { outboxKey, pendingSaves, readLibrary, readOutbox, removedIds, type TSynced } from './library';

it('읽거나 저장한 뒤 바뀐 작품만 저장 대상으로 고르고, 시작한 판을 함께 보낸다', () => {
  const [kept, edited, added] = [sampleProject(), sampleProject(), sampleProject()];
  const synced: TSynced = new Map([
    [kept.id, { project: kept, revision: kept.updatedAt }],
    [edited.id, { project: edited, revision: '2026-11-01T00:00:00.000Z' }],
  ]);
  const changed = { ...edited, title: '달라진 한국어 제목' };
  expect(pendingSaves([kept, changed, added], synced)).toEqual([
    { project: changed, base: '2026-11-01T00:00:00.000Z' },
    { project: added, base: null },
  ]);
  expect(pendingSaves([kept, edited], synced)).toEqual([]);
  expect(removedIds([kept], synced)).toEqual([edited.id]);
});

it('손상된 이전 저장본은 오류로 알리고, 읽을 수 없는 대기 저장분은 비운 것으로 본다', () => {
  expect(() => readLibrary({ getItem: () => '{broken' })).toThrow();
  expect(readLibrary({ getItem: () => null })).toEqual([]);
  const project = sampleProject();
  const stored = new Map([[outboxKey, JSON.stringify([{ project, base: null }])]]);
  expect(readOutbox({ getItem: (key) => stored.get(key) ?? null })).toEqual([{ project, base: null }]);
  expect(readOutbox({ getItem: () => JSON.stringify([{ project: { title: '형식이 다른 값' } }]) })).toEqual(
    [],
  );
  expect(readOutbox({ getItem: () => '{broken' })).toEqual([]);
  expect(readOutbox({ getItem: () => null })).toEqual([]);
});
