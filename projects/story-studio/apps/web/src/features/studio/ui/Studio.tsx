'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

import { useMutation, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { ArrowRight, Check, ChevronRight, X } from 'lucide-react';
import { match } from 'ts-pattern';

import { Button, IconButton, Spinner } from '@side/design-system';

import { trackStudioEvent } from '../../../shared/analytics';
import { fetchDemoProject, fetchProject } from '../../library/api/library-client';
import { downloadFile, readBackup } from '../../library/model/library';
import { useLibrary } from '../../library/ui/use-library';
import {
  cancelVideoTask,
  downloadRenderedVideo,
  fetchVideoTask,
  parseSceneImage,
  uploadSceneImage,
} from '../../media/api/media-client';
import { localImageReady } from '../../media/model/image-generation';
import { updateVideoTasks } from '../../media/model/video-tasks';
import { fetchActiveWriting, fetchWritingStatus, stopWriting } from '../../story/api/writing-client';
import { defaultBrief, withFormat } from '../../story/model/brief';
import { sampleProject } from '../../story/model/sample';
import {
  briefSchema,
  caption,
  formats,
  imagePrompt,
  libraryLimit,
  referenceImage,
  safeFilename,
  sceneDuration,
  spokenCaption,
  taskSchema,
  voiceSchema,
  writingStatusSchema,
  type TBrief,
  type TFormat,
  type TProject,
  type TScene,
  type TWritingStatus,
} from '../../story/model/story';
import { getStudioConfiguration, requestStudio } from '../api/studio-client';
import { CreateForm } from './CreateForm';
import { StudioSidebar } from './StudioSidebar';

const StoryEditor = dynamic(() => import('../../story/ui/StoryEditor').then((module) => module.StoryEditor), {
  loading: () => <p role="status">작품 여는 중…</p>,
});
const ConnectionPanel = dynamic(() => import('./ConnectionPanel').then((module) => module.ConnectionPanel), {
  loading: () => <p role="status">연결 설정 여는 중…</p>,
});

export function Studio({
  initialFormat,
  openSample = false,
  demoSource,
}: {
  initialFormat?: TFormat;
  openSample?: boolean;
  demoSource?: 'bundled' | 'local';
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [brief, setBrief] = useState<TBrief>(() =>
    withFormat(defaultBrief, initialFormat ?? defaultBrief.format),
  );
  const [settings, setSettings] = useState(false);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [pollError, setPollError] = useState('');
  const [pollEpoch, setPollEpoch] = useState(0);
  const [renderProgress, setRenderProgress] = useState('');
  const [deletePending, setDeletePending] = useState(false);
  const controller = useRef<AbortController | null>(null);
  // The writing job this screen is watching, so the stop button can end the job and not only the watching.
  const writing = useRef<string | null>(null);
  const [dismissedConfigError, setDismissedConfigError] = useState<number | null>(null);
  const { projects, setProjects, ready, storageError, adopt, flush } = useLibrary((stored) => {
    if (!openSample) return stored;
    const existing = stored.find((item) => item.sample);
    if (existing) {
      setSelected(existing.id);
      return stored;
    }
    if (stored.length >= libraryLimit) {
      setNotice('작품을 백업한 뒤 기존 작품을 삭제해 주세요');
      return stored;
    }
    const sample = sampleProject();
    setSelected(sample.id);
    return [sample, ...stored];
  });
  const stopJob = useMutation({ mutationFn: stopWriting });
  const cancelTask = useMutation({ mutationFn: cancelVideoTask });
  const uploadImage = useMutation({ mutationFn: uploadSceneImage });
  const project = projects.find((item) => item.id === selected);
  const configuration = useQuery({
    queryKey: ['studio', 'configuration'],
    queryFn: ({ signal }) => getStudioConfiguration(signal),
    refetchOnWindowFocus: 'always',
    refetchInterval: ({ state }) =>
      (settings || (project && project.brief.format !== 'novel')) &&
      state.data?.provider === 'local' &&
      !localImageReady(state.data)
        ? 15_000
        : false,
  });
  const configError =
    configuration.isError && configuration.errorUpdatedAt !== dismissedConfigError
      ? 'AI 연결 상태를 확인하지 못했습니다. 서버가 실행 중인지 확인해 주세요.'
      : '';
  const visibleNotice = notice || configError;
  const config = configuration.data ?? null;
  const connected = config?.configured === true;
  const local = config?.provider !== 'cloud';
  const capabilities = {
    image: local ? localImageReady(config) : connected,
    video: config?.videoReady ?? connected,
    voice: config?.voiceReady === true,
    voiceTraining: config?.voiceTrainingReady === true,
  };
  const taskKey = useMemo(() => {
    const pending = projects.flatMap((item) =>
      item.scenes.flatMap((scene) =>
        scene.video && ['PENDING', 'RUNNING'].includes(scene.video.status) ? [scene.video.id] : [],
      ),
    );
    return [...new Set(pending)].join(',');
  }, [projects]);
  const openDemo = useEffectEvent((demo: TProject) => {
    if (projects.some((item) => item.id === demo.id)) {
      setSelected(demo.id);
      return;
    }
    addProject(demo);
  });
  useEffect(() => {
    if (!ready || !demoSource) return;
    const abort = new AbortController();
    void fetchDemoProject(demoSource, abort.signal)
      .then((demo) => {
        if (!abort.signal.aborted) openDemo(demo);
      })
      .catch((error) => {
        if (!abort.signal.aborted)
          setNotice(error instanceof Error ? error.message : '생성 결과를 읽지 못했습니다.');
      });
    return () => abort.abort();
  }, [ready, demoSource]);

  const entrySource = demoSource ? 'demo' : openSample ? 'sample' : initialFormat || 'blank';
  useEffect(() => {
    void trackStudioEvent('studio_opened', { source: entrySource });
  }, [entrySource]);
  useEffect(() => () => controller.current?.abort(), []);

  const resumeWriting = useEffectEvent((id: string) => {
    void work('이야기 작성 중', (signal) => follow(id, signal));
  });
  useEffect(() => {
    if (!ready) return;
    const abort = new AbortController();
    void fetchActiveWriting(abort.signal)
      .then(([running]) => {
        if (running && !abort.signal.aborted) resumeWriting(running.id);
      })
      .catch(() => undefined);
    return () => abort.abort();
  }, [ready]);
  useEffect(() => {
    if (!taskKey || pollError || !connected) return;
    const abort = new AbortController();
    const started = performance.now();
    const tick = async (): Promise<void> => {
      if (document.visibilityState === 'hidden') {
        timer.id = window.setTimeout(() => void tick(), 10_000);
        return;
      }
      try {
        const tasks = await Promise.all(taskKey.split(',').map((id) => fetchVideoTask(id, abort.signal)));
        if (abort.signal.aborted) return;
        setProjects((current) => updateVideoTasks(current, tasks));
        if (performance.now() - started > (local ? 60 : 15) * 60_000) {
          setPollError(
            '영상 자동 확인을 멈췄습니다. 새 작업을 만들지 않고 기존 작업을 다시 확인할 수 있습니다.',
          );
          return;
        }
        timer.id = window.setTimeout(() => void tick(), 10_000);
      } catch (error) {
        if (!abort.signal.aborted)
          setPollError(error instanceof Error ? error.message : '영상 상태 확인에 실패했습니다.');
      }
    };
    const timer = { id: window.setTimeout(() => void tick(), 2000) };
    return () => {
      abort.abort();
      window.clearTimeout(timer.id);
    };
  }, [taskKey, pollError, connected, pollEpoch, setProjects, local]);

  async function work(label: string, callback: (signal: AbortSignal) => Promise<void>) {
    if (controller.current) return;
    const current = new AbortController();
    controller.current = current;
    setBusy(label);
    setNotice('');
    try {
      await callback(current.signal);
    } catch (error) {
      setNotice(
        current.signal.aborted
          ? '작업을 중단했습니다. 기존 원고는 유지됩니다.'
          : error instanceof Error
            ? error.message
            : '처리하지 못했습니다. 다시 시도해 주세요.',
      );
    } finally {
      controller.current = null;
      setBusy('');
      setRenderProgress('');
    }
  }
  function addProject(item: TProject) {
    if (projects.length >= libraryLimit)
      throw new Error(`작품은 최대 ${libraryLimit}개까지 저장됩니다. 기존 작품을 백업한 뒤 삭제해 주세요.`);
    setProjects((current) => [item, ...current]);
    setSelected(item.id);
    setDeletePending(false);
  }
  function patchProject(id: string, change: Partial<TProject>) {
    setProjects((current) =>
      current.map((item) =>
        item.id === id ? { ...item, ...change, updatedAt: dayjs().toISOString() } : item,
      ),
    );
  }
  function patchScene(projectId: string, sceneId: string, change: Partial<TScene>) {
    setProjects((current) =>
      current.map((item) =>
        item.id === projectId
          ? {
              ...item,
              updatedAt: dayjs().toISOString(),
              scenes: item.scenes.map((scene) => (scene.id === sceneId ? { ...scene, ...change } : scene)),
            }
          : item,
      ),
    );
  }
  function create() {
    const parsed = briefSchema.safeParse(brief);
    if (!parsed.success) {
      setNotice('어떤 이야기를 만들고 싶은지 10자 이상 적어 주세요.');
      return;
    }
    if (projects.length >= libraryLimit) {
      setNotice(`작품을 백업한 뒤 기존 작품을 삭제해 주세요. 최대 ${libraryLimit}개까지 저장합니다.`);
      return;
    }
    void work('이야기 구성 중', async (signal) => {
      const job = writingStatusSchema.parse(await requestStudio('write', parsed.data, signal));
      await follow(job.id, signal);
    });
  }
  // Writing runs on the server and saves every finished scene into the work. This only watches it:
  // leaving the page stops the watching, not the writing.
  async function follow(id: string, signal: AbortSignal) {
    writing.current = id;
    try {
      const watch = async (seen: number): Promise<TWritingStatus> => {
        const status = await fetchWritingStatus(id, signal);
        signal.throwIfAborted();
        setRenderProgress(status.progress);
        if (status.projectId && status.scenes !== seen) {
          const draft = await fetchProject(status.projectId, signal);
          signal.throwIfAborted();
          adopt(draft);
          setSelected(status.projectId);
        }
        if (status.status !== 'RUNNING') return status;
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return watch(status.scenes);
      };
      const ended = await watch(-1);
      void trackStudioEvent('studio_writing_finished', {
        status: match(ended.status)
          .with('SUCCEEDED', () => 'succeeded' as const)
          .with('CANCELLED', () => 'cancelled' as const)
          .with('FAILED', 'RUNNING', () => 'failed' as const)
          .exhaustive(),
      });
      if (ended.status !== 'SUCCEEDED')
        throw new Error(ended.error || '원고를 쓰지 못했습니다. 다시 시도해 주세요.');
    } finally {
      writing.current = null;
    }
  }
  // Stopping ends the writing itself; scenes already saved stay in the work.
  function stop() {
    const current = controller.current;
    if (!writing.current) {
      current?.abort();
      return;
    }
    void trackStudioEvent('studio_request_clicked', { action: 'writing-stop' });
    stopJob.mutate(writing.current, {
      onSuccess: () => {
        void trackStudioEvent('studio_request_succeeded', { action: 'writing-stop' });
        current?.abort();
      },
      onError: (error) => setNotice(error.message),
    });
  }
  function importImage(scene: TScene, file: File) {
    if (!project || project.brief.format === 'novel') return;
    void work('이미지 가져오는 중', async (signal) => {
      const { fitImage } = await import('../../media/model/image-import');
      void trackStudioEvent('studio_request_clicked', { action: 'image-import' });
      const asset = await uploadImage.mutateAsync({
        image: await fitImage(file, project.brief.ratio),
        signal,
      });
      void trackStudioEvent('studio_request_succeeded', { action: 'image-import' });
      patchScene(project.id, scene.id, { image: asset });
    });
  }
  async function copyPrompt(scene: TScene) {
    if (!project) return;
    void trackStudioEvent('studio_prompt_clicked', { action: 'copy' });
    try {
      await navigator.clipboard.writeText(imagePrompt(project, scene));
      setNotice('이미지 프롬프트를 복사했습니다. 만든 이미지는 이 장면의 이미지 가져오기로 넣어 주세요.');
    } catch {
      setNotice('프롬프트를 복사하지 못했습니다. 브라우저의 복사 권한을 확인해 주세요.');
    }
  }
  function media(scene: TScene, type: 'image' | 'video') {
    if (!project || project.brief.format === 'novel') return;
    // Only the local engine conditions on a reference image or a first frame.
    const reference = type === 'image' && local ? referenceImage(project, scene) : undefined;
    const label = match(type)
      .with('video', () => '영상 작업 제출 중')
      .with('image', () => (reference ? '인물 기준을 참고해 이미지 생성 중' : '이미지 생성 중'))
      .exhaustive();
    void work(label, async (signal) => {
      const data = await requestStudio(
        type,
        {
          format: project.brief.format,
          style: project.brief.style,
          characters: project.characters,
          ratio: project.brief.ratio,
          quality: project.brief.quality,
          scene,
          ...(type === 'video' && local ? { image: scene.image } : { reference }),
        },
        signal,
      );
      if (type === 'video') {
        patchScene(project.id, scene.id, { video: taskSchema.parse(data) });
        return;
      }
      patchScene(project.id, scene.id, { image: parseSceneImage(data) });
    });
  }
  function extend() {
    if (!project) return;
    void work('다음 이야기 작성 중', async (signal) => {
      // The job reads the work from the studio's file, so the latest edits are saved first.
      if (!(await flush()))
        throw new Error(
          '최신 원고를 저장하지 못해 이어쓰기를 시작하지 않았습니다. 저장 상태를 확인해 주세요.',
        );
      const job = writingStatusSchema.parse(
        await requestStudio('continue', { projectId: project.id }, signal),
      );
      await follow(job.id, signal);
    });
  }
  function voice(scene: TScene) {
    if (!project) return;
    void work('한국어 음성 생성 중', async (signal) => {
      const result = voiceSchema.parse(
        await requestStudio('voice', { text: caption(scene), settings: scene.voiceSettings }, signal),
      );
      patchScene(project.id, scene.id, {
        voice: { ...result, transcript: caption(scene) },
        ...(!scene.video ? { duration: Math.min(15, Math.max(2, Math.ceil(result.duration + 0.4))) } : {}),
      });
    });
  }
  function cancelVideo(scene: TScene) {
    if (!project || !scene.video) return;
    const taskId = scene.video.id;
    void work('영상 생성 중단 중', async (signal) => {
      void trackStudioEvent('studio_request_clicked', { action: 'video-stop' });
      const video = await cancelTask.mutateAsync({ id: taskId, signal });
      void trackStudioEvent('studio_request_succeeded', { action: 'video-stop' });
      patchScene(project.id, scene.id, { video });
    });
  }
  function render() {
    if (!project) return;
    void work(project.brief.format === 'webtoon' ? '웹툰 저장 중' : '영상 합치는 중', async (signal) => {
      if (project.brief.format === 'webtoon') {
        const { exportWebtoon } = await import('../../media/model/webtoon-export');
        downloadFile(await exportWebtoon(project, signal), `${safeFilename(project.title)}.png`);
        setNotice('한글 말풍선을 넣은 웹툰을 내려받았습니다.');
        return;
      }
      if (local || project.scenes.some((scene) => scene.voice)) {
        const renderedCues = project.scenes.map((scene) => ({
          text: spokenCaption(scene),
          duration: sceneDuration(scene),
        }));
        const result = (await requestStudio(
          'compose',
          {
            scenes: project.scenes.map((scene) => ({
              video: scene.video?.asset,
              voice: scene.voice?.asset,
              caption: spokenCaption(scene),
              duration: scene.duration,
            })),
          },
          signal,
        )) as { asset: string };
        if (!/^\/api\/assets\/[a-f0-9-]{36}\.mp4$/.test(result.asset))
          throw new Error('합본 영상 결과를 확인하지 못했습니다');
        patchProject(project.id, { renderedVideo: result.asset, renderedCues });
        downloadFile(await downloadRenderedVideo(result.asset, signal), `${safeFilename(project.title)}.mp4`);
        setNotice('한국어 음성과 자막을 넣은 영상을 저장했습니다');
        return;
      }
      const { exportVideo } = await import('../../media/model/video-export');
      const result = await exportVideo(project, signal, setRenderProgress);
      downloadFile(result.blob, `${safeFilename(project.title)}.${result.extension}`);
      setNotice('한국어 자막을 넣은 영상을 내려받았습니다.');
    });
  }
  async function importProject(file: File) {
    if (file.size > 2_000_000) {
      setNotice('작품 백업은 2MB 이하의 JSON 파일을 선택해 주세요.');
      return;
    }
    try {
      const imported = readBackup(await file.text());
      addProject({ ...imported, id: crypto.randomUUID(), updatedAt: dayjs().toISOString() });
      setNotice(
        '작품을 새 사본으로 가져왔습니다. 이미지,영상 파일은 원본 스튜디오의 저장 폴더가 있어야 열립니다.',
      );
    } catch {
      setNotice('지원하는 작품 백업이 아닙니다. 장면에서 내보낸 JSON 파일을 선택해 주세요.');
    }
  }
  return (
    <div className="studio-shell">
      <StudioSidebar
        projects={projects}
        selected={selected}
        ready={ready}
        busy={Boolean(busy)}
        config={config}
        settingsOpen={settings}
        onSettings={() => setSettings((open) => !open)}
        onImport={importProject}
        onSelect={(id) => {
          setSelected(id);
          setNotice('');
          setDeletePending(false);
        }}
      />
      <div className="main-shell">
        <header className="topbar" data-view={project ? 'editor' : 'create'}>
          <span>
            나의 작업실 <ChevronRight size={13} />{' '}
            <strong>
              {project ? formats.find((format) => format.id === project.brief.format)?.name : '새 이야기'}
            </strong>
          </span>
          <span className="topbar-right">
            <span className="language-badge">가</span> 한국어 창작 <span className="topbar-rule" />
            <span className="save-status">
              {storageError ? (
                '저장 확인 필요'
              ) : ready ? (
                <>
                  <Check size={13} /> 이 컴퓨터에 자동 저장
                </>
              ) : (
                '작업실 여는 중'
              )}
            </span>
          </span>
        </header>
        <main id="main-content">
          {settings && (
            <ConnectionPanel
              config={config}
              local={local}
              onClose={() => setSettings(false)}
              onRefresh={() => void configuration.refetch()}
            />
          )}
          {storageError && (
            <div className="notice warning" role="alert">
              {storageError}
            </div>
          )}
          {visibleNotice && (
            <div className="notice" role="status">
              <span>{visibleNotice}</span>
              <IconButton
                label="알림 닫기"
                onClick={() => {
                  if (notice) {
                    setNotice('');
                    return;
                  }
                  setDismissedConfigError(configuration.errorUpdatedAt);
                }}
              >
                <X size={16} />
              </IconButton>
            </div>
          )}
          {pollError && (
            <div className="notice warning" role="alert">
              <span>{pollError}</span>
              <Button
                variant="secondary"
                size="sm"

                onClick={() => {
                  setPollError('');
                  setPollEpoch((value) => value + 1);
                }}
              >
                기존 영상 상태 다시 확인
              </Button>
            </div>
          )}
          {busy && (
            <div className="work-status" role="status">
              <Spinner className="size-4" />
              <span>
                {renderProgress || busy}{' '}
                <small>
                  {busy.includes('영상')
                    ? '이 화면을 열어 두세요.'
                    : '이야기를 다듬고 있어요. 잠시만 기다려 주세요.'}
                </small>
              </span>
              {(local || !['이미지 생성 중', '영상 작업 제출 중'].includes(busy)) && (
                <Button variant="ghost" size="sm" disabled={stopJob.isPending} onClick={stop}>
                  중단
                </Button>
              )}
            </div>
          )}
          {project ? (
            <>
              <StoryEditor
                project={project}
                busy={Boolean(busy)}
                onCancelVideo={cancelVideo}
                connected={connected}
                local={local}
                capabilities={capabilities}
                patch={(change) => patchProject(project.id, change)}
                patchScene={(id, change) => patchScene(project.id, id, change)}
                media={media}
                voice={voice}
                extend={extend}
                render={render}
                onImportImage={importImage}
                onCopyPrompt={(scene) => void copyPrompt(scene)}
              />
              <footer className="project-footer">
                <span>마지막 수정 {dayjs(project.updatedAt).format('YYYY.MM.DD HH:mm')}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger"
                  disabled={Boolean(busy)}
                  onClick={() => {
                    if (
                      local &&
                      project.scenes.some(
                        (scene) => scene.video && ['PENDING', 'RUNNING'].includes(scene.video.status),
                      )
                    ) {
                      setNotice(
                        '영상 생성이 진행 중입니다. 해당 장면에서 생성을 중단한 뒤 작품을 삭제해 주세요.',
                      );
                      return;
                    }
                    if (!deletePending) {
                      setDeletePending(true);
                      return;
                    }
                    setProjects((current) => current.filter((item) => item.id !== project.id));
                    setSelected(null);
                    setDeletePending(false);
                  }}
                >
                  {deletePending ? '이 작품의 원고를 삭제할까요? 한 번 더 눌러 확인' : '이 작품 삭제'}
                </Button>
              </footer>
            </>
          ) : (
            <>
              <div className="workspace-heading">
                <div>
                  <h1>새 작품 만들기</h1>
                  <p>형식과 아이디어를 정하면 원고부터 시작해요</p>
                </div>
                <Button
                  variant="secondary"

                  disabled={Boolean(busy) || !ready}
                  onClick={() => {
                    try {
                      addProject(sampleProject());
                    } catch (error) {
                      setNotice((error as Error).message);
                    }
                  }}
                >
                  예시 작품 열기 <ArrowRight size={15} />
                </Button>
              </div>
              <CreateForm
                brief={brief}
                busy={Boolean(busy)}
                ready={ready}
                connected={connected}
                local={local}
                known={config !== null}
                onBriefChange={setBrief}
                onCreate={create}
                onShowSettings={() => setSettings(true)}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
