'use client';

import { Copy, Download, ImagePlus, Upload, UserRoundCheck, Video, Volume2 } from 'lucide-react';

import { downloadFile } from '../../library/model/library';
import { VoiceSelector } from '../../voice/ui/VoiceSelector';
import { caption, safeFilename, subtitles, type TProject, type TScene } from '../model/story';

export type TCapabilities = { image: boolean; video: boolean; voice: boolean; voiceTraining: boolean };
// One scene: its picture and video on one side, its text and voice on the other.
export function SceneCard({
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
  capabilities: TCapabilities;
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
