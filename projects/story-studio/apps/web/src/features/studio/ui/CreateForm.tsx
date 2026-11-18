'use client';

import type { Dispatch, SetStateAction } from 'react';

import {
  ArrowRight,
  BookOpen,
  Check,
  Clapperboard,
  GalleryVerticalEnd,
  PanelsTopLeft,
  PenLine,
  Sparkles,
  TvMinimalPlay,
} from 'lucide-react';

import { Button, FormField, Input, NativeSelect, NativeSelectOption, Textarea } from '@side/design-system';

import { trackStudioEvent } from '../../../shared/analytics';
import { CollectionPicker } from '../../materials/ui/CollectionPicker';
import { withFormat } from '../../story/model/brief';
import { ideas } from '../../story/model/sample';
import { formats, type TBrief, type TFormat } from '../../story/model/story';
import styles from './CreateForm.module.css';

const formatIcons = {
  film: Clapperboard,
  drama: TvMinimalPlay,
  animation: GalleryVerticalEnd,
  webtoon: PanelsTopLeft,
  novel: BookOpen,
} satisfies Record<TFormat, typeof BookOpen>;

// The brief for a new work: format, idea, genre, style and how much to write first.
export function CreateForm({
  brief,
  busy,
  ready,
  connected,
  local,
  known,
  onBriefChange,
  onCreate,
  onShowSettings,
}: {
  brief: TBrief;
  busy: boolean;
  ready: boolean;
  connected: boolean;
  local: boolean;
  // Whether the connection state has been read yet.
  known: boolean;
  onBriefChange: Dispatch<SetStateAction<TBrief>>;
  onCreate: () => void;
  onShowSettings: () => void;
}) {
  return (
    <section className="create-section" aria-label="새 작품 만들기">
      <div className="section-heading">
        <h2>작품 형식</h2>
      </div>
      <div className={styles.formats}>
        {formats.map((format) => {
          const Icon = formatIcons[format.id];
          const selected = brief.format === format.id;
          return (
            <Button
              variant="ghost"
              type="button"
              key={format.id}
              className={styles.format}
              aria-pressed={selected}
              aria-label={`${format.name} ${format.description}`}
              disabled={busy}
              onClick={() => {
                if (selected) return;
                void trackStudioEvent('studio_format_selected', { format: format.id });
                onBriefChange((current) => withFormat(current, format.id));
              }}
            >
              <Icon className={styles.formatIcon} size={21} strokeWidth={1.65} aria-hidden />
              <strong>{format.name}</strong>
              <span className={styles.description}>{format.description}</span>
              {selected && <Check size={14} className={styles.check} aria-hidden />}
            </Button>
          );
        })}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onCreate();
        }}
      >
        <fieldset disabled={busy || !ready}>
          <legend className="sr-only">이야기 설정</legend>
          <div className="section-heading prompt-heading">
            <h2 id="premise-label">이야기 아이디어</h2>
          </div>
          <div className="prompt-box">
            <Textarea
              id="premise"
              aria-labelledby="premise-label"
              value={brief.premise}
              minLength={10}
              maxLength={4000}
              rows={5}
              placeholder="예: 비 오는 날에만 문을 여는 우체국. 어느 날, 10년 뒤의 나에게서 편지가 도착했다."
              onChange={(event) => onBriefChange((current) => ({ ...current, premise: event.target.value }))}
            />
            <div className="prompt-meta">
              <span>
                <PenLine size={13} /> 배경, 주인공, 꼭 담고 싶은 장면을 자유롭게 적어 주세요
              </span>
              <span>{brief.premise.length.toLocaleString('ko-KR')} / 4,000</span>
            </div>
          </div>
          <div className="idea-row">
            <span>
              <Sparkles size={13} /> 영감이 필요하다면
            </span>
            {['미래에서 온 편지', '마지막 심야버스', '꿈을 수선하는 가게'].map((label, index) => (
              <Button
                variant="secondary"
                size="sm"
                shape="pill"
                className="px-2.5 text-caption"
                type="button"
                key={label}
                onClick={() => onBriefChange((current) => ({ ...current, premise: ideas[index]! }))}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="brief-options">
            <FormField label="장르">
              <NativeSelect
                value={brief.genre}
                onChange={(event) => onBriefChange((current) => ({ ...current, genre: event.target.value }))}
              >
                {['판타지', '로맨스', '일상, 힐링', '미스터리', 'SF', '모험', '코미디', '공포', '드라마'].map(
                  (value) => (
                    <NativeSelectOption key={value}>{value}</NativeSelectOption>
                  ),
                )}
              </NativeSelect>
            </FormField>
            <FormField
              label={brief.format === 'novel' ? '문체, 분위기' : '그림체, 연출'}
              className="style-field"
            >
              <Input
                value={brief.style}
                maxLength={200}
                required
                onChange={(event) => onBriefChange((current) => ({ ...current, style: event.target.value }))}
              />
            </FormField>
            <FormField
              label={
                brief.format === 'novel' ? '이번에 쓸 장' : brief.format === 'webtoon' ? '컷 수' : '장면 수'
              }
            >
              <NativeSelect
                value={brief.count}
                onChange={(event) =>
                  onBriefChange((current) => ({ ...current, count: Number(event.target.value) }))
                }
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {value}
                    {brief.format === 'novel' ? '개 장' : brief.format === 'webtoon' ? '컷' : '개 장면'}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </FormField>
            {brief.format !== 'novel' && (
              <FormField label="화면 비율">
                <NativeSelect
                  value={brief.ratio}
                  onChange={(event) =>
                    onBriefChange((current) => ({
                      ...current,
                      ratio: event.target.value as TBrief['ratio'],
                    }))
                  }
                >
                  <NativeSelectOption value="16:9">16:9 가로</NativeSelectOption>
                  <NativeSelectOption value="9:16">9:16 세로</NativeSelectOption>
                  <NativeSelectOption value="1:1">1:1 정사각형</NativeSelectOption>
                </NativeSelect>
              </FormField>
            )}
            {local && brief.format !== 'novel' && (
              <FormField label="생성 품질">
                <NativeSelect
                  value={brief.quality}
                  onChange={(event) =>
                    onBriefChange((current) => ({
                      ...current,
                      quality: event.target.value as TBrief['quality'],
                    }))
                  }
                >
                  <NativeSelectOption value="draft">빠른 초안</NativeSelectOption>
                  <NativeSelectOption value="standard">표준</NativeSelectOption>
                </NativeSelect>
              </FormField>
            )}
          </div>
          {known && local && (
            <CollectionPicker
              value={brief.collections}
              onChange={(collections) => onBriefChange((current) => ({ ...current, collections }))}
            />
          )}
          <div className="create-footer">
            <p>
              <span className="language-badge">가</span> 원고, 대사, 말풍선, 자막, 모두 한국어로
            </p>
            <Button variant="primary" className="generate-button" type="submit" disabled={!connected || busy}>
              이야기 만들기
            </Button>
          </div>
        </fieldset>
      </form>
      {!connected && known && (
        <div className="setup-nudge">
          <span>
            {local ? '로컬 모델을 준비하면 시작할 수 있어요' : 'AI를 연결하면 창작을 시작할 수 있어요'}
          </span>
          <Button variant="ghost" size="sm" onClick={onShowSettings}>
            연결 방법 보기 <ArrowRight size={13} />
          </Button>
        </div>
      )}
    </section>
  );
}
