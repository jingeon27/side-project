import { expect, it, vi } from 'vitest';

import { sampleProject } from '../../story/model/sample';
import { readLibrary, writeLibrary } from './library';

it('저장할 내용이 바뀌지 않으면 브라우저 저장소를 다시 쓰지 않는다', () => {
  const storage = { setItem: vi.fn() };
  const projects = [sampleProject()];
  const serialized = writeLibrary(storage, projects);
  expect(writeLibrary(storage, projects, serialized)).toBe(serialized);
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  writeLibrary(storage, [{ ...projects[0]!, title: '달라진 한국어 제목' }], serialized);
  expect(storage.setItem).toHaveBeenCalledTimes(2);
});

it('손상된 저장본과 저장 공간 초과를 성공으로 취급하지 않는다', () => {
  expect(() => readLibrary({ getItem: () => '{broken' })).toThrow();
  expect(() =>
    writeLibrary(
      {
        setItem: () => {
          throw new Error('quota');
        },
      },
      [sampleProject()],
    ),
  ).toThrow('quota');
});
