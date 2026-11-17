import { randomUUID } from 'node:crypto';

import dayjs from 'dayjs';
import { match } from 'ts-pattern';

import { StudioError } from '../../../shared/server/errors';
import { isLocalMode, openLocalSession, type TLocalSession } from '../../../shared/server/local-worker';
import { readProject, saveProject, updateProject } from '../../library/server/project-store';
import {
  makeProject,
  type TBeat,
  type TBrief,
  type TFormat,
  type TProject,
  type TWritingStatus,
} from '../model/story';
import { generatePlan, writeScene } from './writer';

// A writing job belongs to the server, not to the browser tab that started it. It saves every finished
// scene into the work's file, so closing the tab, a failure or a stop keeps what was written, and the
// beats still to write stay in the work for the next job.
type TJob = TWritingStatus & { controller: AbortController };
const runtime = globalThis as typeof globalThis & { storyStudioWriting?: Map<string, TJob> };
const jobs = runtime.storyStudioWriting ?? new Map<string, TJob>();
runtime.storyStudioWriting = jobs;

function report(job: TJob): TWritingStatus {
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    scenes: job.scenes,
    ...(job.projectId ? { projectId: job.projectId } : {}),
    ...(job.error ? { error: job.error } : {}),
  };
}
function unit(format: TFormat) {
  return match(format)
    .with('novel', () => '장')
    .with('webtoon', () => '컷')
    .with('film', 'drama', 'animation', () => '장면')
    .exhaustive();
}
function start(projectId: string | undefined, work: (job: TJob, session?: TLocalSession) => Promise<void>) {
  const job: TJob = {
    id: randomUUID(),
    status: 'RUNNING',
    progress: '집필을 준비하는 중',
    scenes: 0,
    projectId,
    controller: new AbortController(),
  };
  // Finished jobs are kept only long enough for the browser to read how they ended.
  const finished = [...jobs.values()].filter((item) => item.status !== 'RUNNING');
  for (const item of finished.slice(0, Math.max(0, finished.length - 20))) jobs.delete(item.id);
  jobs.set(job.id, job);
  void (async () => {
    try {
      // The local writer is loaded once for the whole job instead of once per scene.
      const session = isLocalMode()
        ? await openLocalSession(job.controller.signal, (message) => {
            job.progress = message;
          })
        : undefined;
      try {
        await work(job, session);
        job.status = 'SUCCEEDED';
      } finally {
        await session?.close();
      }
    } catch (error) {
      const stopped = job.controller.signal.aborted;
      job.status = stopped ? 'CANCELLED' : 'FAILED';
      job.error = stopped
        ? '집필을 중단했습니다. 쓴 내용은 보존했습니다.'
        : error instanceof StudioError
          ? error.message
          : '원고를 쓰지 못했습니다. 쓴 내용은 보존했습니다. 다시 시도해 주세요.';
    }
  })();
  return report(job);
}
function appended(
  project: TProject,
  scene: Awaited<ReturnType<typeof writeScene>>,
  outline: TBeat[] | undefined,
) {
  return {
    ...project,
    scenes: [...project.scenes, { ...scene, id: randomUUID() }],
    outline,
    updatedAt: dayjs().toISOString(),
  };
}

// Plans the story, then writes each planned scene with its own request.
export function startStory(brief: TBrief) {
  return start(undefined, async (job, session) => {
    const signal = job.controller.signal;
    job.progress = '이야기를 구성하는 중';
    const { outline, ...story } = await generatePlan(brief, signal, session);
    const writeNext = async (project: TProject | undefined, beats: TBeat[]): Promise<void> => {
      const [beat, ...upcoming] = beats;
      if (!beat) return;
      job.progress = `${outline.length}개 ${unit(brief.format)} 중 ${outline.length - beats.length + 1}번째 작성 중`;
      const scene = await writeScene(
        {
          brief,
          title: story.title,
          synopsis: story.synopsis,
          characters: story.characters,
          scenes: (project?.scenes ?? []).slice(-6),
          beat,
          upcoming,
        },
        signal,
        session,
      );
      const remaining = upcoming.length ? upcoming : undefined;
      const saved = project
        ? await updateProject(project.id, (current) => appended(current, scene, remaining))
        : await saveProject(
            { ...makeProject(brief, { ...story, scenes: [scene] }), outline: remaining },
            null,
          );
      job.projectId = saved.id;
      job.scenes = saved.scenes.length;
      return writeNext(saved, upcoming);
    };
    await writeNext(undefined, outline);
  });
}
// Writes the next planned beat of a work, or continues freely once the plan is used up.
export async function continueStory(projectId: string) {
  const project = await readProject(projectId);
  if (project.scenes.length >= 80) throw new StudioError('작품은 최대 80개 장면까지 이어 씁니다.', 400);
  return start(projectId, async (job, session) => {
    const [beat, ...upcoming] = project.outline ?? [];
    job.scenes = project.scenes.length;
    job.progress = `다음 ${unit(project.brief.format)}을 쓰는 중`;
    const scene = await writeScene(
      {
        brief: project.brief,
        title: project.title,
        synopsis: project.synopsis,
        characters: project.characters,
        scenes: project.scenes.slice(-6),
        ...(beat ? { beat, upcoming } : {}),
      },
      job.controller.signal,
      session,
    );
    const saved = await updateProject(projectId, (current) =>
      appended(current, scene, beat ? (upcoming.length ? upcoming : undefined) : current.outline),
    );
    job.scenes = saved.scenes.length;
  });
}
function find(id: string) {
  const job = jobs.get(id);
  if (!job)
    throw new StudioError('집필 작업을 찾을 수 없습니다. 작품을 다시 열어 쓴 내용을 확인해 주세요.', 404);
  return job;
}
export function writingStatus(id: string) {
  return report(find(id));
}
export function activeWriting() {
  return [...jobs.values()].filter((job) => job.status === 'RUNNING').map(report);
}
export function cancelWriting(id: string) {
  const job = find(id);
  job.controller.abort();
  return report(job);
}
