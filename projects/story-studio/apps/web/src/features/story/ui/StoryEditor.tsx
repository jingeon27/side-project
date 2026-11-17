'use client';

import { Copy, Download, ImagePlus, Play, Plus, Upload, UserRoundCheck, Video, Volume2 } from 'lucide-react';

import { trackStudioEvent } from '../../../shared/analytics';
import { downloadFile } from '../../library/model/library';
import { CollectionPicker } from '../../materials/ui/CollectionPicker';
import { VoiceSelector } from '../../voice/ui/VoiceSelector';
import {
  caption,
  formats,
  manuscript,
  safeFilename,
  sceneDuration,
  subtitles,
  type TProject,
  type TScene,
} from '../model/story';

type TProps = {
  project: TProject;
  busy: boolean;
  connected: boolean;
  local: boolean;
  capabilities: { image: boolean; video: boolean; voice: boolean; voiceTraining: boolean };
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

function SceneCard({
  scene,
  index,
  project,
  busy,
  connected,
  capabilities,
  local,
  patch,
  media,
  voice,
  onCancelVideo,
  onReferenceChange,
  onImportImage,
  onCopyPrompt,
}: {
  scene: TScene;
  index: number;
  project: TProject;
  busy: boolean;
  connected: boolean;
  capabilities: TProps['capabilities'];
  local: boolean;
  patch: (change: Partial<TScene>) => void;
  media: (type: 'image' | 'video') => void;
  voice: () => void;
  onCancelVideo: () => void;
  onReferenceChange: (selected: boolean) => void;
  onImportImage: (file: File) => void;
  onCopyPrompt: () => void;
}) {
  const novel = project.brief.format === 'novel';
  const webtoon = project.brief.format === 'webtoon';
  const reference = project.referenceSceneId === scene.id;
  const pending = scene.video && ['PENDING', 'RUNNING'].includes(scene.video.status);
  const prefix = `scene-${scene.id}`;
  return (
    <article className={`scene-card ${novel ? 'chapter-card' : ''}`}>
      {!novel && (
        <div className="scene-visual">
          {scene.video?.asset && !webtoon ? (
            <video
              controls
              playsInline
              preload={index === 0 ? 'metadata' : 'none'}
              src={scene.video.asset}
              aria-label={`${index + 1}번째 장면 영상`}
            />
          ) : scene.image ? (
            <img src={scene.image} alt={scene.visual} loading="lazy" decoding="async" />
          ) : (
            <div className="empty-frame">
              <div className={`frame-art art-${index % 3}`} aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <ImagePlus size={25} />
              <span>상상을 한 장면으로</span>
              <small>아래 버튼으로 {webtoon ? '웹툰 컷' : '스토리보드 이미지'}를 생성하세요</small>
            </div>
          )}
          {scene.video?.asset && !webtoon && <div className="preview-caption">{caption(scene)}</div>}
          <div className="media-toolbar">
            <button
              className="button secondary small"
              disabled={busy || !capabilities.image}
              onClick={() => media('image')}
            >
              <ImagePlus size={14} /> {scene.image ? '이미지 다시 생성' : '이미지 생성'}
            </button>
            {!webtoon && (
              <button
                className="button secondary small"
                disabled={busy || !capabilities.video || Boolean(pending)}
                onClick={() => media('video')}
              >
                <Video size={14} />{' '}
                {pending ? '영상 만드는 중…' : scene.video?.asset ? '영상 다시 생성' : '영상 생성'}
              </button>
            )}
            {local && scene.image && (
              <button
                className="button secondary small"
                disabled={busy}
                onClick={() => onReferenceChange(!reference)}
              >
                <UserRoundCheck size={14} /> {reference ? '인물 기준 해제' : '인물 기준으로 사용'}
              </button>
            )}
            <button className="button secondary small" disabled={busy} onClick={onCopyPrompt}>
              <Copy size={14} /> 프롬프트 복사
            </button>
            <label className="button secondary small import-button" aria-disabled={busy}>
              <Upload size={14} /> 이미지 가져오기
              <input
                className="sr-only"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={busy}
                aria-label={`${index + 1}번째 장면 이미지 파일`}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onImportImage(file);
                  event.target.value = '';
                }}
              />
            </label>
          </div>
          {pending && (
            <p className="job-status" role="status">
              {scene.video?.progress || (scene.video?.status === 'RUNNING' ? '영상 생성 중' : '영상 대기 중')}{' '}
              , {local ? '컴퓨터 성능과 분량에 따라 시간이 걸려요' : '약 1~5분'}, 새로고침해도 이어서
              확인합니다
            </p>
          )}
          {local && scene.video?.status === 'RUNNING' && (
            <button className="text-button" disabled={busy} onClick={onCancelVideo}>
              영상 생성 중단
            </button>
          )}
          {scene.video?.error && <p className="inline-error">{scene.video.error}</p>}
          <div className="asset-downloads">
            {scene.image && (
              <a href={scene.image} download={`${safeFilename(project.title)}-${index + 1}.png`}>
                <Download size={12} /> PNG 원본
              </a>
            )}
            {scene.video?.asset && (
              <a href={scene.video.asset} download={`${safeFilename(project.title)}-${index + 1}.mp4`}>
                <Download size={12} /> MP4 원본
              </a>
            )}
            {scene.video?.asset && (
              <button onClick={() => downloadFile(subtitles([scene]), `${safeFilename(scene.title)}.srt`)}>
                이 장면 자막
              </button>
            )}
          </div>
        </div>
      )}
      <fieldset className="scene-writing" disabled={busy}>
        <legend className="sr-only">
          {index + 1}번째 {novel ? '장' : webtoon ? '컷' : '장면'} 편집
        </legend>
        <div className="scene-topline">
          <span className="scene-number">{String(index + 1).padStart(2, '0')}</span>
          <label className="sr-only" htmlFor={`${prefix}-title`}>
            {index + 1}번째 제목
          </label>
          <input
            id={`${prefix}-title`}
            className="scene-title"
            value={scene.title}
            maxLength={150}
            onChange={(event) => {
              if (event.target.value.trim()) patch({ title: event.target.value });
            }}
          />
          {!novel && !webtoon && (
            <label className="duration">
              <span className="sr-only">{index + 1}번째 장면 길이</span>
              <select
                value={scene.duration}
                disabled={Boolean(pending || scene.video?.asset)}
                onChange={(event) => patch({ duration: Number(event.target.value) })}
              >
                {Array.from({ length: 14 }, (_, index) => index + 2).map((value) => (
                  <option key={value} value={value}>
                    {value}초
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <label htmlFor={`${prefix}-narration`}>{novel ? '본문' : '지문, 내레이션'}</label>
        <textarea
          id={`${prefix}-narration`}
          className={novel ? 'novel-body' : ''}
          value={scene.narration}
          maxLength={12000}
          rows={novel ? 14 : 3}
          onChange={(event) => patch({ narration: event.target.value })}
        />
        {!novel && (
          <>
            <label htmlFor={`${prefix}-dialogue`}>{webtoon ? '한국어 말풍선' : '한국어 대사, 자막'}</label>
            <textarea
              id={`${prefix}-dialogue`}
              value={scene.dialogue}
              maxLength={4000}
              rows={2}
              placeholder="인물 이름: 대사를 입력하세요"
              onChange={(event) => patch({ dialogue: event.target.value })}
            />
            <details className="visual-direction">
              <summary>장면 연출 수정</summary>
              <label htmlFor={`${prefix}-visual`}>장소, 인물 외형, 구도, 움직임</label>
              <textarea
                id={`${prefix}-visual`}
                rows={3}
                value={scene.visual}
                maxLength={2000}
                onChange={(event) => patch({ visual: event.target.value })}
              />
            </details>
          </>
        )}
        <div className="voice-section">
          <VoiceSelector
            id={prefix}
            value={scene.voiceSettings}
            onChange={(value) => patch({ voiceSettings: value })}
          />
          <button
            className="button secondary small"
            disabled={
              busy ||
              !(scene.voiceSettings?.kind === 'trained' ? capabilities.voiceTraining : capabilities.voice) ||
              !caption(scene).trim()
            }
            onClick={voice}
          >
            <Volume2 size={15} /> {scene.voice ? '한국어 음성 다시 생성' : '한국어 음성 생성'}
          </button>
          <span>대사가 있으면 대사, 없으면 본문을 읽어요</span>
          {scene.voice && (
            <>
              <audio
                controls
                preload={index === 0 ? 'metadata' : 'none'}
                src={scene.voice.asset}
                aria-label={`${index + 1}번째 한국어 음성`}
              />
              <a href={scene.voice.asset} download={`${safeFilename(scene.title)}.wav`}>
                한국어 음성 저장, {scene.voice.duration.toFixed(1)}초
              </a>
            </>
          )}
        </div>
        {scene.sources && scene.sources.length > 0 && (
          <p className="scene-sources">참고한 자료: {scene.sources.join(', ')}</p>
        )}
      </fieldset>
    </article>
  );
}
