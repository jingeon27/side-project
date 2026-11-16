'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import dayjs from 'dayjs';
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Clapperboard,
  Film,
  FolderOpen,
  LoaderCircle,
  PenLine,
  Plus,
  Settings2,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';

import { trackStudioEvent, type TStudioAction } from '../lib/analytics';
import { downloadFile, readBackup } from '../lib/library';
import { defaultBrief, ideas, sampleProject } from '../lib/sample';
import {
  briefSchema,
  caption,
  draftSchema,
  formats,
  makeProject,
  projectSchema,
  safeFilename,
  sceneContentSchema,
  taskSchema,
  voiceSchema,
  type TBrief,
  type TFormat,
  type TProject,
  type TScene,
} from '../lib/story';
import { exportVideo } from '../lib/video-export';
import { updateVideoTasks } from '../lib/video-tasks';
import { exportWebtoon } from '../lib/webtoon-export';
import { StoryEditor } from './StoryEditor';
import { useLibrary } from './use-library';

type TConfiguration = {
  configured: boolean;
  textModel: string;
  imageModel: string;
  videoModel: string;
  provider?: 'local' | 'cloud';
  voiceModel?: string;
  voiceReady?: boolean;
  voiceTrainingReady?: boolean;
  imageReady?: boolean;
  videoReady?: boolean;
  demoReady?: boolean;
};
async function request(action: TStudioAction, input: unknown, signal: AbortSignal): Promise<unknown> {
  void trackStudioEvent('studio_request_clicked', { action });
  const response = await fetch('/api/studio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, input }),
    signal,
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(typeof data.error === 'string' ? data.error : '요청을 처리하지 못했습니다.');
  void trackStudioEvent('studio_request_succeeded', { action });
  return data;
}
export function Studio({
  initialFormat,
  openSample = false,
  openDemo = false,
}: {
  initialFormat?: TFormat;
  openSample?: boolean;
  openDemo?: boolean;
}) {
  const { projects, setProjects, ready, storageError } = useLibrary();
  const [selected, setSelected] = useState<string | null>(null);
  const [brief, setBrief] = useState<TBrief>(() => ({
    ...defaultBrief,
    ...(initialFormat
      ? {
          format: initialFormat,
          style:
            initialFormat === 'novel'
              ? '섬세한 감정 묘사와 자연스러운 한국어 문체'
              : initialFormat === 'webtoon'
                ? '선명한 한국 웹툰 작화'
                : initialFormat === 'animation'
                  ? defaultBrief.style
                  : '자연스러운 한국 영화의 시네마틱 연출',
          ratio: initialFormat === 'webtoon' ? '9:16' : '16:9',
        }
      : {}),
  }));
  const [config, setConfig] = useState<TConfiguration | null>(null);
  const [settings, setSettings] = useState(false);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [pollError, setPollError] = useState('');
  const [pollEpoch, setPollEpoch] = useState(0);
  const [renderProgress, setRenderProgress] = useState('');
  const [deletePending, setDeletePending] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const sampleOpened = useRef(false);
  const demoOpened = useRef(false);
  const project = projects.find((item) => item.id === selected);
  const connected = config?.configured === true;
  const local = config?.provider !== 'cloud';
  const capabilities = {
    image: config?.imageReady ?? connected,
    video: config?.videoReady ?? connected,
    voice: config?.voiceReady === true,
    voiceTraining: config?.voiceTrainingReady === true,
  };
  const videoTasks = projects.flatMap((item) =>
    item.scenes.flatMap((scene) =>
      scene.video && ['PENDING', 'RUNNING'].includes(scene.video.status) ? [scene.video.id] : [],
    ),
  );
  const taskKey = [...new Set(videoTasks)].join(',');
  useEffect(() => {
    if (!ready || !openDemo || demoOpened.current) return;
    demoOpened.current = true;
    void fetch('/api/demo')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '생성 결과를 읽지 못했습니다');
        const demo = projectSchema.parse(data);
        if (projects.some((item) => item.id === demo.id)) {
          setSelected(demo.id);
          return;
        }
        if (projects.length >= 50)
          throw new Error('작품이 50개입니다. 기존 작품을 백업하고 공간을 비워 주세요');
        setProjects((current) => [demo, ...current]);
        setSelected(demo.id);
      })
      .catch((error) => setNotice(error instanceof Error ? error.message : '생성 결과를 읽지 못했습니다'));
  }, [ready, openDemo, projects, setProjects]);

  useEffect(() => {
    if (!ready || !openSample || sampleOpened.current) return;
    sampleOpened.current = true;
    const existing = projects.find((item) => item.sample);
    if (existing) {
      setSelected(existing.id);
      return;
    }
    if (projects.length >= 50) {
      setNotice('작품을 백업한 뒤 기존 작품을 삭제해 주세요');
      return;
    }
    const sample = sampleProject();
    setProjects((current) => [sample, ...current]);
    setSelected(sample.id);
  }, [ready, openSample, projects, setProjects]);

  async function loadConfiguration() {
    try {
      const response = await fetch('/api/studio');
      if (!response.ok) throw new Error();
      setConfig(await response.json());
    } catch {
      setNotice('AI 연결 상태를 확인하지 못했습니다. 서버가 실행 중인지 확인해 주세요.');
    }
  }
  useEffect(() => {
    void trackStudioEvent('studio_opened', {
      source: openDemo ? 'demo' : openSample ? 'sample' : initialFormat || 'blank',
    });
    void loadConfiguration();
    return () => controller.current?.abort();
  }, []);
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
        const tasks = await Promise.all(
          taskKey.split(',').map(async (id) => {
            const response = await fetch(`/api/tasks/${id}`, { signal: abort.signal });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || '영상 상태를 확인하지 못했습니다.');
            return taskSchema.parse(data);
          }),
        );
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
    if (projects.length >= 50)
      throw new Error('작품은 최대 50개까지 저장됩니다. 기존 작품을 백업한 뒤 삭제해 주세요.');
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
    if (projects.length >= 50) {
      setNotice('작품을 백업한 뒤 기존 작품을 삭제해 주세요. 최대 50개까지 저장합니다.');
      return;
    }
    void work('원고 작성 중', async (signal) => {
      const draft = draftSchema.parse(await request('draft', parsed.data, signal));
      addProject(makeProject(parsed.data, draft));
    });
  }
  function media(scene: TScene, type: 'image' | 'video') {
    if (!project || project.brief.format === 'novel') return;
    void work(type === 'image' ? '이미지 생성 중' : '영상 작업 제출 중', async (signal) => {
      const data = await request(
        type,
        {
          format: project.brief.format,
          style: project.brief.style,
          characters: project.characters,
          ratio: project.brief.ratio,
          quality: project.brief.quality,
          scene,
        },
        signal,
      );
      if (type === 'video') {
        patchScene(project.id, scene.id, { video: taskSchema.parse(data) });
        return;
      }
      const result = data as { asset: string };
      if (!/^\/api\/assets\/[a-f0-9-]{36}\.png$/.test(result.asset))
        throw new Error('이미지 응답을 확인하지 못했습니다.');
      patchScene(project.id, scene.id, { image: result.asset });
    });
  }
  function extend() {
    if (!project) return;
    void work('다음 이야기 작성 중', async (signal) => {
      const result = sceneContentSchema.parse(
        await request(
          'continue',
          {
            brief: project.brief,
            title: project.title,
            synopsis: project.synopsis,
            characters: project.characters,
            scenes: project.scenes.slice(-6),
          },
          signal,
        ),
      );
      patchProject(project.id, { scenes: [...project.scenes, { ...result, id: crypto.randomUUID() }] });
    });
  }
  function voice(scene: TScene) {
    if (!project) return;
    void work('한국어 음성 생성 중', async (signal) => {
      const result = voiceSchema.parse(
        await request('voice', { text: caption(scene), settings: scene.voiceSettings }, signal),
      );
      patchScene(project.id, scene.id, {
        voice: result,
        ...(!scene.video ? { duration: Math.min(15, Math.max(2, Math.ceil(result.duration + 0.4))) } : {}),
      });
    });
  }
  function cancelVideo(scene: TScene) {
    if (!project || !scene.video) return;
    const taskId = scene.video.id;
    void work('영상 생성 중단 중', async (signal) => {
      const response = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE', signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '영상 생성을 중단하지 못했습니다');
      patchScene(project.id, scene.id, { video: taskSchema.parse(result) });
    });
  }
  function render() {
    if (!project) return;
    void work(project.brief.format === 'webtoon' ? '웹툰 저장 중' : '영상 합치는 중', async (signal) => {
      if (project.brief.format === 'webtoon') {
        downloadFile(await exportWebtoon(project, signal), `${safeFilename(project.title)}.png`);
        setNotice('한글 말풍선을 넣은 웹툰을 내려받았습니다.');
        return;
      }
      if (local || project.scenes.some((scene) => scene.voice)) {
        const result = (await request(
          'compose',
          {
            scenes: project.scenes.map((scene) => ({
              video: scene.video?.asset,
              voice: scene.voice?.asset,
              caption: caption(scene),
              duration: scene.duration,
            })),
          },
          signal,
        )) as { asset: string };
        if (!/^\/api\/assets\/[a-f0-9-]{36}\.mp4$/.test(result.asset))
          throw new Error('합본 영상 결과를 확인하지 못했습니다');
        patchProject(project.id, { renderedVideo: result.asset });
        const response = await fetch(result.asset, { signal });
        if (!response.ok) throw new Error('완성 영상을 열지 못했습니다');
        downloadFile(await response.blob(), `${safeFilename(project.title)}.mp4`);
        setNotice('한국어 음성과 자막을 넣은 영상을 저장했습니다');
        return;
      }
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
      <aside className="sidebar">
        <Link
          className="brand"
          href="/"
          onClick={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          <span className="brand-mark">
            <Clapperboard size={22} />
          </span>
          <span>
            장면<small>STORY STUDIO</small>
          </span>
        </Link>
        <button
          className="button primary new-project"
          disabled={Boolean(busy) || !ready}
          onClick={() => {
            setSelected(null);
            setNotice('');
            setDeletePending(false);
          }}
        >
          <Plus size={17} /> 새 이야기 만들기
        </button>
        <div className="library-label">
          <span>나의 작업실</span>
          <span>{projects.length.toString().padStart(2, '0')}</span>
        </div>
        <nav className="project-nav" aria-label="저장한 작품">
          {projects.map((item) => (
            <button
              key={item.id}
              className={`project-link ${selected === item.id ? 'active' : ''}`}
              disabled={Boolean(busy)}
              onClick={() => {
                setSelected(item.id);
                setDeletePending(false);
                setNotice('');
              }}
            >
              {item.brief.format === 'novel' ? <BookOpen size={17} /> : <Film size={17} />}
              <span>
                {item.title}
                <small>
                  {formats.find((format) => format.id === item.brief.format)?.name}, {item.scenes.length}
                  {item.brief.format === 'novel' ? '개 장' : '개 장면'}
                </small>
              </span>
            </button>
          ))}
          {ready && projects.length === 0 && (
            <div className="empty-library">
              <FolderOpen size={24} />
              <p>
                아직 빈 작업실이에요.
                <br />첫 이야기를 시작해 보세요.
              </p>
            </div>
          )}
        </nav>
        <Link
          className="voice-nav-link"
          href="/studio/voices"
          onClick={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          목소리 학습 <ArrowRight size={15} />
        </Link>
        <div className="sidebar-footer">
          <button
            className="text-button"
            disabled={Boolean(busy) || !ready}
            onClick={() => fileInput.current?.click()}
          >
            <Upload size={16} /> 작품 가져오기
          </button>
          <input
            className="sr-only"
            type="file"
            accept="application/json,.json"
            ref={fileInput}
            aria-label="작품 백업 파일"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importProject(file);
              event.target.value = '';
            }}
          />
          <button
            className="connection-button"
            aria-expanded={settings}
            onClick={() => setSettings(!settings)}
          >
            <span className={`status-light ${connected ? 'connected' : ''}`} />
            <span>
              {config === null
                ? 'AI 연결 확인 중'
                : local
                  ? connected
                    ? '로컬 모델 사용 중'
                    : '로컬 모델 준비 필요'
                  : connected
                    ? 'AI 연결 설정됨'
                    : 'AI 연결이 필요해요'}
            </span>
            <Settings2 size={15} />
          </button>
          <p>
            작품은 이 브라우저에 저장됩니다.
            <br />
            생성한 파일은 이 컴퓨터에 보관됩니다.
          </p>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
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
                  <Check size={13} /> 브라우저 자동 저장
                </>
              ) : (
                '작업실 여는 중'
              )}
            </span>
          </span>
        </header>
        <main id="main-content">
          {settings && (
            <section className="connection-panel" aria-label="AI 연결 안내">
              <div className="section-heading">
                <h2>{local ? '로컬 모델' : '클라우드 연결'}</h2>
                <button
                  className="icon-button"
                  aria-label="연결 안내 닫기"
                  onClick={() => setSettings(false)}
                >
                  <X size={18} />
                </button>
              </div>
              {local ? (
                <>
                  <p>
                    글, 컷, 영상과 한국어 음성을 이 컴퓨터에서 만듭니다. API 키와 외부 생성 서비스가 필요하지
                    않습니다.
                  </p>
                  <div className="model-list">
                    <span>
                      글, 대본<strong>{config?.textModel || 'Qwen 3.8'}</strong>
                    </span>
                    <span>
                      이미지, 영상<strong>{config?.videoModel || 'Wan 2.1'}</strong>
                    </span>
                    <span>
                      한국어 목소리<strong>{config?.voiceModel || 'Qwen3-TTS'}</strong>
                    </span>
                  </div>
                  <p>
                    한국어 음성을 먼저 만들고 장면별 영상을 생성한 뒤, 내보내기에서 음성,자막을 담은 MP4로
                    합칠 수 있어요. 영상 생성은 성능과 분량에 따라 수분 이상 걸릴 수 있습니다.
                  </p>
                  <details>
                    <summary>처음 사용하는 컴퓨터에서 준비하기</summary>
                    <p>
                      Apple Silicon Mac과 Python 3.11이 필요합니다. 아래 명령은 프로젝트 전용 실행 환경과
                      모델을 설치합니다. 최초 다운로드에는 인터넷과 여유 저장 공간이 필요하며, 설치 후 생성은
                      오프라인으로 실행합니다.
                    </p>
                    <code>yarn workspace @side/story-studio local:setup</code>
                  </details>
                  <div className="panel-actions">
                    {config?.demoReady && (
                      <Link href="/studio?demo=1">이 컴퓨터에서 만든 애니메이션 열기 →</Link>
                    )}
                    <button className="button secondary small" onClick={() => void loadConfiguration()}>
                      모델 상태 다시 확인
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p>
                    클라우드 모드는 서버에 명시적으로 설정했을 때만 사용합니다. 싱가포르 Model Studio API 키를
                    앱의 서버 환경에 설정해 주세요. 요청마다 외부 서비스 사용 요금이 발생합니다.
                  </p>
                  <div className="panel-actions">
                    <a
                      href="https://www.alibabacloud.com/help/en/model-studio/get-api-key"
                      target="_blank"
                      rel="noreferrer"
                    >
                      API 키 발급 안내 ↗
                    </a>
                    <button className="button secondary small" onClick={() => void loadConfiguration()}>
                      연결 다시 확인
                    </button>
                  </div>
                </>
              )}
            </section>
          )}
          {storageError && (
            <div className="notice warning" role="alert">
              {storageError}
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              <span>{notice}</span>
              <button className="icon-button" aria-label="알림 닫기" onClick={() => setNotice('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {pollError && (
            <div className="notice warning" role="alert">
              <span>{pollError}</span>
              <button
                className="button secondary small"
                onClick={() => {
                  setPollError('');
                  setPollEpoch((value) => value + 1);
                }}
              >
                기존 영상 상태 다시 확인
              </button>
            </div>
          )}
          {busy && (
            <div className="work-status" role="status">
              <LoaderCircle className="spinner" size={17} />
              <span>
                {renderProgress || busy}{' '}
                <small>
                  {busy.includes('영상')
                    ? '이 화면을 열어 두세요.'
                    : '이야기를 다듬고 있어요. 잠시만 기다려 주세요.'}
                </small>
              </span>
              {(local || !['이미지 생성 중', '영상 작업 제출 중'].includes(busy)) && (
                <button className="text-button" onClick={() => controller.current?.abort()}>
                  중단
                </button>
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
              />
              <footer className="project-footer">
                <span>마지막 수정 {dayjs(project.updatedAt).format('YYYY.MM.DD HH:mm')}</span>
                <button
                  className="text-button danger"
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
                </button>
              </footer>
            </>
          ) : (
            <>
              <div className="workspace-heading">
                <div>
                  <h1>새 작품 만들기</h1>
                  <p>형식과 아이디어를 정하면 원고부터 시작해요</p>
                </div>
                <button
                  className="button secondary"
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
                </button>
              </div>
              <section className="create-section" aria-label="새 작품 만들기">
                <div className="section-heading">
                  <h2>작품 형식</h2>
                </div>
                <div className="format-grid">
                  {formats.map((format) => (
                    <button
                      key={format.id}
                      className={`format-card ${brief.format === format.id ? 'selected' : ''}`}
                      aria-pressed={brief.format === format.id}
                      aria-label={`${format.name} ${format.description}`}
                      disabled={Boolean(busy)}
                      onClick={() =>
                        setBrief((current) => ({
                          ...current,
                          format: format.id,
                          style:
                            format.id === 'animation'
                              ? '따뜻한 수채화풍'
                              : format.id === 'webtoon'
                                ? '선명한 한국 웹툰 작화'
                                : format.id === 'novel'
                                  ? '섬세한 감정 묘사와 자연스러운 한국어 문체'
                                  : '자연스러운 한국 영화의 시네마틱 연출',
                          ratio: format.id === 'webtoon' ? '9:16' : current.ratio,
                        }))
                      }
                    >
                      <strong>{format.name}</strong>
                    </button>
                  ))}
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    create();
                  }}
                >
                  <fieldset disabled={Boolean(busy) || !ready}>
                    <legend className="sr-only">이야기 설정</legend>
                    <div className="section-heading prompt-heading">
                      <h2>이야기 아이디어</h2>
                    </div>
                    <label className="sr-only" htmlFor="premise">
                      이야기 아이디어
                    </label>
                    <div className="prompt-box">
                      <textarea
                        id="premise"
                        value={brief.premise}
                        minLength={10}
                        maxLength={4000}
                        rows={5}
                        placeholder="예: 비 오는 날에만 문을 여는 우체국. 어느 날, 10년 뒤의 나에게서 편지가 도착했다."
                        onChange={(event) =>
                          setBrief((current) => ({ ...current, premise: event.target.value }))
                        }
                      />
                      <div className="prompt-meta">
                        <span>
                          <PenLine size={13} /> 배경, 주인공, 꼭 담고 싶은 장면을 자유롭게 적어 주세요
                        </span>
                        <span>{brief.premise.length}/4,000</span>
                      </div>
                    </div>
                    <div className="idea-row">
                      <span>
                        <Sparkles size={13} /> 영감이 필요하다면
                      </span>
                      {['미래에서 온 편지', '마지막 심야버스', '꿈을 수선하는 가게'].map((label, index) => (
                        <button
                          type="button"
                          key={label}
                          onClick={() => setBrief((current) => ({ ...current, premise: ideas[index]! }))}
                        >
                          {label} <Plus size={11} />
                        </button>
                      ))}
                    </div>
                    <div className="brief-options">
                      <label>
                        장르
                        <select
                          value={brief.genre}
                          onChange={(event) =>
                            setBrief((current) => ({ ...current, genre: event.target.value }))
                          }
                        >
                          {[
                            '판타지',
                            '로맨스',
                            '일상, 힐링',
                            '미스터리',
                            'SF',
                            '모험',
                            '코미디',
                            '공포',
                            '드라마',
                          ].map((value) => (
                            <option key={value}>{value}</option>
                          ))}
                        </select>
                      </label>
                      <label className="style-field">
                        {brief.format === 'novel' ? '문체, 분위기' : '그림체, 연출'}
                        <input
                          value={brief.style}
                          maxLength={200}
                          required
                          onChange={(event) =>
                            setBrief((current) => ({ ...current, style: event.target.value }))
                          }
                        />
                      </label>
                      <label>
                        {brief.format === 'novel'
                          ? '이번에 쓸 장'
                          : brief.format === 'webtoon'
                            ? '컷 수'
                            : '장면 수'}
                        <select
                          value={brief.count}
                          onChange={(event) =>
                            setBrief((current) => ({ ...current, count: Number(event.target.value) }))
                          }
                        >
                          {[1, 2, 3, 4, 5, 6, 7, 8].map((value) => (
                            <option key={value} value={value}>
                              {value}
                              {brief.format === 'novel'
                                ? '개 장'
                                : brief.format === 'webtoon'
                                  ? '컷'
                                  : '개 장면'}
                            </option>
                          ))}
                        </select>
                      </label>
                      {brief.format !== 'novel' && (
                        <label>
                          화면 비율
                          <select
                            value={brief.ratio}
                            onChange={(event) =>
                              setBrief((current) => ({
                                ...current,
                                ratio: event.target.value as TBrief['ratio'],
                              }))
                            }
                          >
                            <option value="16:9">16:9 가로</option>
                            <option value="9:16">9:16 세로</option>
                            <option value="1:1">1:1 정사각형</option>
                          </select>
                        </label>
                      )}
                      {local && brief.format !== 'novel' && (
                        <label>
                          생성 품질
                          <select
                            value={brief.quality}
                            onChange={(event) =>
                              setBrief((current) => ({
                                ...current,
                                quality: event.target.value as TBrief['quality'],
                              }))
                            }
                          >
                            <option value="draft">빠른 초안</option>
                            <option value="standard">표준</option>
                          </select>
                        </label>
                      )}
                    </div>
                    <div className="create-footer">
                      <p>
                        <span className="language-badge">가</span> 원고, 대사, 말풍선, 자막, 모두 한국어로
                      </p>
                      <button
                        className="button primary generate-button"
                        type="submit"
                        disabled={!connected || Boolean(busy)}
                      >
                        <Sparkles size={16} /> 이야기 만들기 <ArrowRight size={16} />
                      </button>
                    </div>
                  </fieldset>
                </form>
                {!connected && config !== null && (
                  <div className="setup-nudge">
                    <span>
                      {local
                        ? '로컬 모델을 준비하면 시작할 수 있어요'
                        : 'AI를 연결하면 창작을 시작할 수 있어요'}
                    </span>
                    <button className="text-button" onClick={() => setSettings(true)}>
                      연결 방법 보기 <ArrowRight size={13} />
                    </button>
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
