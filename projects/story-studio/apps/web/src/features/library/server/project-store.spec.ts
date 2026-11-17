import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import dayjs from 'dayjs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { dataPath } from '../../media/server/assets';
import { sampleProject } from '../../story/model/sample';
import {
  deleteProject,
  listProjects,
  ProjectConflictError,
  readProject,
  saveProject,
  updateProject,
} from './project-store';

const state = { directory: '' };
beforeEach(async () => {
  state.directory = await mkdtemp(path.join(os.tmpdir(), 'story-studio-projects-'));
  vi.stubEnv('STORY_STUDIO_DATA_DIR', state.directory);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(state.directory, { recursive: true, force: true });
});

it('작품을 파일 하나로 저장하고 최근에 고친 순서로 돌려준다', async () => {
  const older = { ...sampleProject(), title: '먼저 쓴 작품', updatedAt: dayjs('2026-11-01').toISOString() };
  const newer = {
    ...sampleProject(),
    title: '“괜찮아, 서우야” 🐈',
    updatedAt: dayjs('2026-11-02').toISOString(),
  };
  await saveProject(older, null);
  await saveProject(newer, null);
  expect((await listProjects()).projects).toEqual([newer, older]);
  expect(await readProject(older.id)).toEqual(older);
  expect((await readdir(dataPath('projects'))).sort()).toEqual(
    [`${newer.id}.json`, `${older.id}.json`].sort(),
  );
});

it('마지막으로 본 판에서 이어 저장하고, 다른 곳에서 바뀐 작품은 덮어쓰지 않고 저장된 내용을 돌려준다', async () => {
  const project = sampleProject();
  await saveProject(project, null);
  const edited = {
    ...project,
    title: '고친 제목',
    updatedAt: dayjs(project.updatedAt).add(1, 'minute').toISOString(),
  };
  expect(await saveProject(edited, project.updatedAt)).toEqual(edited);
  const stale = { ...project, title: '오래된 창의 제목' };
  const conflict = await saveProject(stale, project.updatedAt).catch((error: unknown) => error);
  expect(conflict).toBeInstanceOf(ProjectConflictError);
  expect((conflict as ProjectConflictError).current).toEqual(edited);
  // A work the caller believes is new never replaces one that already exists.
  await expect(saveProject(stale, null)).rejects.toMatchObject({ status: 409 });
  expect((await readProject(project.id)).title).toBe('고친 제목');
});

it('서버 쪽 수정은 차례로 적용하고, 그 뒤의 오래된 저장은 충돌로 알린다', async () => {
  const project = sampleProject();
  await saveProject(project, null);
  const scene = project.scenes[0]!;
  await Promise.all(
    ['첫 추가', '둘째 추가'].map((title) =>
      updateProject(project.id, (current) => ({
        ...current,
        scenes: [...current.scenes, { ...scene, id: crypto.randomUUID(), title }],
        updatedAt: dayjs(current.updatedAt).add(1, 'second').toISOString(),
      })),
    ),
  );
  const written = await readProject(project.id);
  expect(written.scenes.map((item) => item.title).slice(-2)).toEqual(['첫 추가', '둘째 추가']);
  await expect(saveProject({ ...project, title: '집필 전의 창' }, project.updatedAt)).rejects.toBeInstanceOf(
    ProjectConflictError,
  );
});

it('읽을 수 없는 파일은 지우지 않고 개수로 알리며, 잘못된 작품과 경로를 벗어난 ID를 거부한다', async () => {
  const project = sampleProject();
  await saveProject(project, null);
  await mkdir(dataPath('projects'), { recursive: true });
  await writeFile(dataPath('projects', 'broken.json'), '{broken');
  await writeFile(dataPath('projects', 'older.json'), JSON.stringify({ ...project, version: 0 }));
  expect(await listProjects()).toMatchObject({ projects: [project], unreadable: 2 });
  expect(await readdir(dataPath('projects'))).toHaveLength(3);
  await expect(saveProject({ ...project, id: '../escape' }, null)).rejects.toMatchObject({ status: 400 });
  await expect(readProject('../escape')).rejects.toMatchObject({ status: 400 });
  await expect(readProject(crypto.randomUUID())).rejects.toMatchObject({ status: 404 });
  expect(await deleteProject(project.id)).toEqual({ id: project.id });
  expect((await listProjects()).projects).toEqual([]);
});
