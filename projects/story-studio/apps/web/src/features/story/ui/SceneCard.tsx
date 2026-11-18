'use client';

import { Copy, Download, ImagePlus, Upload, UserRoundCheck, Video, Volume2 } from 'lucide-react';

import {
  Button,
  Disclosure,
  DisclosureTrigger,
  FormField,
  Input,
  NativeSelect,
  NativeSelectOption,
  Textarea,
} from '@side/design-system';
import { ButtonLink } from '@side/design-system/next';

import { FilePickerButton } from '../../../shared/ui/FilePickerButton';
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
            <Button
              variant="secondary"
              size="sm"

              disabled={busy || !capabilities.image}
              onClick={() => media('image')}
            >
              <ImagePlus size={14} /> {scene.image ? '이미지 다시 생성' : '이미지 생성'}
            </Button>
            {!webtoon && (
              <Button
                variant="secondary"
                size="sm"

                disabled={busy || !capabilities.video || Boolean(pending)}
                onClick={() => media('video')}
              >
                <Video size={14} />{' '}
                {pending ? '영상 만드는 중…' : scene.video?.asset ? '영상 다시 생성' : '영상 생성'}
              </Button>
            )}
            {local && scene.image && (
              <Button
                variant="secondary"
                size="sm"

                disabled={busy}
                onClick={() => onReferenceChange(!reference)}
              >
                <UserRoundCheck size={14} /> {reference ? '인물 기준 해제' : '인물 기준으로 사용'}
              </Button>
            )}
            <Button variant="secondary" size="sm" disabled={busy} onClick={onCopyPrompt}>
              <Copy size={14} /> 프롬프트 복사
            </Button>
            <FilePickerButton
              label="이미지 가져오기"
              inputLabel={`${index + 1}번째 장면 이미지 파일`}
              accept="image/png,image/jpeg,image/webp"
              size="sm"
              icon={<Upload size={14} aria-hidden />}
              disabled={busy}
              onFiles={([file]) => {
                if (file) onImportImage(file);
              }}
            />
          </div>
          {pending && (
            <p className="job-status" role="status">
              {scene.video?.progress || (scene.video?.status === 'RUNNING' ? '영상 생성 중' : '영상 대기 중')}{' '}
              , {local ? '컴퓨터 성능과 분량에 따라 시간이 걸려요' : '약 1~5분'}, 새로고침해도 이어서
              확인합니다
            </p>
          )}
          {local && scene.video?.status === 'RUNNING' && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={onCancelVideo}>
              영상 생성 중단
            </Button>
          )}
          {scene.video?.error && <p className="inline-error">{scene.video.error}</p>}
          <div className="asset-downloads">
            {scene.image && (
              <ButtonLink
                variant="ghost"
                size="sm"
                prefetch={false}
                href={scene.image}
                download={`${safeFilename(project.title)}-${index + 1}.png`}
              >
                <Download size={12} /> PNG 원본
              </ButtonLink>
            )}
            {scene.video?.asset && (
              <ButtonLink
                variant="ghost"
                size="sm"
                prefetch={false}
                href={scene.video.asset}
                download={`${safeFilename(project.title)}-${index + 1}.mp4`}
              >
                <Download size={12} /> MP4 원본
              </ButtonLink>
            )}
            {scene.video?.asset && (
              <Button
                variant="ghost"
                onClick={() => downloadFile(subtitles([scene]), `${safeFilename(scene.title)}.srt`)}
              >
                이 장면 자막
              </Button>
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
          <Input
            aria-label={`${index + 1}번째 제목`}
            id={`${prefix}-title`}
            className="scene-title"
            value={scene.title}
            maxLength={150}
            onChange={(event) => {
              if (event.target.value.trim()) patch({ title: event.target.value });
            }}
          />
          {!novel && !webtoon && (
            <NativeSelect
              className="duration"
              aria-label={`${index + 1}번째 장면 길이`}
              value={scene.duration}
              disabled={Boolean(pending || scene.video?.asset)}
              onChange={(event) => patch({ duration: Number(event.target.value) })}
            >
              {Array.from({ length: 14 }, (_, index) => index + 2).map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {value}초
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </div>
        <FormField label={novel ? '본문' : '지문, 내레이션'}>
          <Textarea
            id={`${prefix}-narration`}
            className={novel ? 'novel-body' : ''}
            value={scene.narration}
            maxLength={12000}
            rows={novel ? 14 : 3}
            onChange={(event) => patch({ narration: event.target.value })}
          />
        </FormField>
        {!novel && (
          <>
            <FormField label={webtoon ? '한국어 말풍선' : '한국어 대사, 자막'}>
              <Textarea
                id={`${prefix}-dialogue`}
                value={scene.dialogue}
                maxLength={4000}
                rows={2}
                placeholder="인물 이름: 대사를 입력하세요"
                onChange={(event) => patch({ dialogue: event.target.value })}
              />
            </FormField>
            <Disclosure className="visual-direction">
              <DisclosureTrigger>장면 연출 수정</DisclosureTrigger>
              <FormField label="장소, 인물 외형, 구도, 움직임">
                <Textarea
                  id={`${prefix}-visual`}
                  rows={3}
                  value={scene.visual}
                  maxLength={2000}
                  onChange={(event) => patch({ visual: event.target.value })}
                />
              </FormField>
            </Disclosure>
          </>
        )}
        <div className="voice-section">
          <VoiceSelector
            id={prefix}
            value={scene.voiceSettings}
            onChange={(value) => patch({ voiceSettings: value })}
          />
          <Button
            variant="secondary"
            size="sm"

            disabled={
              busy ||
              !(scene.voiceSettings?.kind === 'trained' ? capabilities.voiceTraining : capabilities.voice) ||
              !caption(scene).trim()
            }
            onClick={voice}
          >
            <Volume2 size={15} /> {scene.voice ? '한국어 음성 다시 생성' : '한국어 음성 생성'}
          </Button>
          <span>대사가 있으면 대사, 없으면 본문을 읽어요</span>
          {scene.voice && (
            <>
              <audio
                controls
                preload={index === 0 ? 'metadata' : 'none'}
                src={scene.voice.asset}
                aria-label={`${index + 1}번째 한국어 음성`}
              />
              <ButtonLink
                variant="ghost"
                size="sm"
                prefetch={false}
                href={scene.voice.asset}
                download={`${safeFilename(scene.title)}.wav`}
              >
                한국어 음성 저장, {scene.voice.duration.toFixed(1)}초
              </ButtonLink>
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
