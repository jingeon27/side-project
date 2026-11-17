'use client';

import { Download, Play, Plus } from 'lucide-react';

import { trackStudioEvent } from '../../../shared/analytics';
import { downloadFile } from '../../library/model/library';
import { CollectionPicker } from '../../materials/ui/CollectionPicker';
import {
  formats,
  manuscript,
  safeFilename,
  sceneDuration,
  subtitles,
  type TProject,
  type TScene,
} from '../model/story';
import { SceneCard, type TCapabilities } from './SceneCard';

type TProps = {
  project: TProject;
  busy: boolean;
  connected: boolean;
  local: boolean;
  capabilities: TCapabilities;
  patch: (patch: Partial<TProject>) => void;
  patchScene: (id: string, patch: Partial<TScene>) => void;
  media: (scene: TScene, type: 'image' | 'video') => void;
  voice: (scene: TScene) => void;
  extend: () => void;
  render: () => void;
  onCancelVideo: (scene: TScene) => void;
  onImportImage: (scene: TScene, file: File) => void;
  onCopyPrompt: (scene: TScene) => void;
};
export function StoryEditor({
  project,
  busy,
  connected,
  local,
  capabilities,
  patch,
  patchScene,
  media,
  voice,
  extend,
  render,
  onCancelVideo,
  onImportImage,
  onCopyPrompt,
}: TProps) {
  const novel = project.brief.format === 'novel';
  const webtoon = project.brief.format === 'webtoon';
  const format = formats.find((item) => item.id === project.brief.format);
  const completed = project.scenes.filter((scene) => scene.video?.asset).length;
  const filename = safeFilename(project.title);
  // The first planned beat that is not written yet.
  const nextBeat = project.outline?.[0];
  const handleReferenceChange = (scene: TScene, selected: boolean) => {
    patch({ referenceSceneId: selected ? scene.id : undefined });
    void trackStudioEvent('studio_reference_clicked', { action: selected ? 'set' : 'clear' });
  };
  return (
    <section className="editor" aria-label="작품 편집">
      <div className="editor-heading">
        <div>
          <p className="eyebrow">
            {format?.name} 작업실 {project.sample && <span className="sample-label">직접 쓴 예시 원고</span>}
          </p>
          <label className="sr-only" htmlFor="project-title">
            작품 제목
          </label>
          <input
            id="project-title"
            className="title-input"
            value={project.title}
            disabled={busy}
            maxLength={150}
            onChange={(event) => {
              if (event.target.value.trim()) patch({ title: event.target.value });
            }}
          />
          <label className="sr-only" htmlFor="project-logline">
            한 줄 소개
          </label>
          <textarea
            id="project-logline"
            rows={2}
            className="logline-input"
            value={project.logline}
            disabled={busy}
            maxLength={500}
            onChange={(event) => patch({ logline: event.target.value })}
          />
        </div>
        <details className="export-menu">
          <summary className="button secondary">
            <Download size={16} /> 내보내기
          </summary>
          <div className="export-options">
            <button onClick={() => downloadFile(manuscript(project), `${filename}.md`)}>
              원고 내려받기 (.md)
            </button>
            <button onClick={() => downloadFile(`\uFEFF${manuscript(project)}`, `${filename}.txt`)}>
              한글 원고 내려받기 (.txt)
            </button>
            <button
              onClick={() =>
                downloadFile(JSON.stringify(project, null, 2), `${filename}.json`, 'application/json')
              }
            >
              작품 백업 (.json)
            </button>
            {!novel && !webtoon && (
              <>
                <button
                  onClick={() =>
                    downloadFile(subtitles(project.scenes), `${filename}.vtt`, 'text/vtt;charset=utf-8')
                  }
                >
                  전체 한국어 자막 (.vtt)
                </button>
                <button
                  onClick={() => downloadFile(`\uFEFF${subtitles(project.scenes, 'srt')}`, `${filename}.srt`)}
                >
                  편집용 자막 (.srt)
                </button>
                <button disabled={busy || completed !== project.scenes.length} onClick={render}>
                  자막 넣어 영상 합치기 ({completed}/{project.scenes.length})
                </button>
              </>
            )}
            {webtoon && (
              <>
                <button disabled={busy || project.scenes.some((scene) => !scene.image)} onClick={render}>
                  한글 말풍선 포함 웹툰 (.png)
                </button>
                <button onClick={() => window.print()}>웹툰 인쇄 / PDF 저장</button>
              </>
            )}
          </div>
        </details>
      </div>
      {project.renderedVideo && (
        <section className="finished-video" aria-label="마지막 합본 영상">
          <video
            controls
            playsInline
            preload="metadata"
            src={project.renderedVideo}
            aria-label="한국어 음성과 자막이 들어간 완성 영상"
          />
          <a href={project.renderedVideo} download={`${filename}.mp4`}>
            <Download size={15} /> 음성,자막 포함 MP4 저장
          </a>
        </section>
      )}
      <details className="bible">
        <summary>
          줄거리와 등장인물 설정 <span>인물의 외형과 말투를 다음 장면에도 이어갑니다</span>
        </summary>
        <div className="bible-grid">
          <label>
            전체 줄거리
            <textarea
              value={project.synopsis}
              maxLength={6000}
              rows={6}
              disabled={busy}
              onChange={(event) => patch({ synopsis: event.target.value })}
            />
          </label>
          <label>
            등장인물, 외형, 의상, 말투
            <textarea
              value={project.characters}
              maxLength={6000}
              rows={6}
              disabled={busy}
              onChange={(event) => patch({ characters: event.target.value })}
            />
          </label>
        </div>
      </details>
      {local && (
        <CollectionPicker
          value={project.brief.collections}
          disabled={busy}
          onChange={(collections) => patch({ brief: { ...project.brief, collections } })}
        />
      )}
      {local && !novel && (
        <label className="quality-control">
          생성 품질
          <select
            value={project.brief.quality}
            disabled={busy}
            onChange={(event) =>
              patch({
                brief: { ...project.brief, quality: event.target.value as TProject['brief']['quality'] },
              })
            }
          >
            <option value="draft">빠른 초안</option>
            <option value="standard">표준</option>
          </select>
          <span>빠른 초안은 해상도와 프레임 수를 줄여 부하를 낮춰요</span>
        </label>
      )}
      <div className="section-heading">
        <h2>{novel ? '원고' : webtoon ? '컷 구성' : '스토리보드'}</h2>
        <span>
          {project.scenes.length}
          {novel
            ? '개 장'
            : webtoon
              ? '개 컷'
              : `개 장면, ${Math.ceil(project.scenes.reduce((sum, scene) => sum + sceneDuration(scene), 0))}초`}{' '}
          <span className="dot">/</span> {project.brief.ratio}
        </span>
      </div>
      {webtoon && (
        <details className="webtoon-preview">
          <summary className="button secondary">
            <Play size={15} /> 세로 웹툰 미리보기
          </summary>
          <div className="webtoon-strip">
            <h2>{project.title}</h2>
            {project.scenes.map((scene, index) => (
              <figure key={scene.id}>
                {scene.image ? (
                  <img src={scene.image} alt={scene.visual} loading="lazy" decoding="async" />
                ) : (
                  <div className="missing-panel">{index + 1}번째 컷, 이미지를 생성해 주세요</div>
                )}
                {scene.narration && <figcaption>{scene.narration}</figcaption>}
                {scene.dialogue && <p className="speech-bubble">{scene.dialogue}</p>}
              </figure>
            ))}
          </div>
        </details>
      )}
      <div className={novel ? 'chapters' : 'scene-list'}>
        {project.scenes.map((scene, index) => (
          <SceneCard
            key={scene.id}
            scene={scene}
            index={index}
            project={project}
            busy={busy}
            connected={connected}
            capabilities={capabilities}
            local={local}
            patch={(change) => patchScene(scene.id, change)}
            media={(type) => media(scene, type)}
            voice={() => voice(scene)}
            onCancelVideo={() => onCancelVideo(scene)}
            onReferenceChange={(selected) => handleReferenceChange(scene, selected)}
            onImportImage={(file) => onImportImage(scene, file)}
            onCopyPrompt={() => onCopyPrompt(scene)}
          />
        ))}
      </div>
      <button
        className="button extend-button"
        disabled={busy || !connected || project.scenes.length >= 80}
        onClick={extend}
      >
        <Plus size={17} />{' '}
        {novel ? '다음 장 이어 쓰기' : webtoon ? '다음 컷 이어 쓰기' : '다음 장면 이어 쓰기'}
      </button>
      {nextBeat && (
        <p className="fine-print">
          구성해 둔 {novel ? '장' : webtoon ? '컷' : '장면'}이 {project.outline?.length}개 남았습니다. 이어
          쓰면 다음 순서인 {nextBeat.title}부터 씁니다.
        </p>
      )}
      <p className="fine-print">
        이어쓰기는 현재 원고를 보존하고 새 {novel ? '장' : webtoon ? '컷' : '장면'} 하나를 추가합니다.{' '}
        {local ? '이 컴퓨터의 로컬 모델로 실행합니다.' : 'AI 사용 요금이 발생합니다.'}
      </p>
    </section>
  );
}
