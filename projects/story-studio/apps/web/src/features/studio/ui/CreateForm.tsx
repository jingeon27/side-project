'use client';

import { type Dispatch, type SetStateAction } from 'react';

import { ArrowRight, PenLine, Plus, Sparkles } from 'lucide-react';

import { CollectionPicker } from '../../materials/ui/CollectionPicker';
import { ideas } from '../../story/model/sample';
import { formats, type TBrief } from '../../story/model/story';

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
      <div className="format-grid">
        {formats.map((format) => (
          <button
            key={format.id}
            className={`format-card ${brief.format === format.id ? 'selected' : ''}`}
            aria-pressed={brief.format === format.id}
            aria-label={`${format.name} ${format.description}`}
            disabled={busy}
            onClick={() =>
              onBriefChange((current) => ({
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
          onCreate();
        }}
      >
        <fieldset disabled={busy || !ready}>
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
              onChange={(event) => onBriefChange((current) => ({ ...current, premise: event.target.value }))}
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
                onClick={() => onBriefChange((current) => ({ ...current, premise: ideas[index]! }))}
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
                onChange={(event) => onBriefChange((current) => ({ ...current, genre: event.target.value }))}
              >
                {['판타지', '로맨스', '일상, 힐링', '미스터리', 'SF', '모험', '코미디', '공포', '드라마'].map(
                  (value) => (
                    <option key={value}>{value}</option>
                  ),
                )}
              </select>
            </label>
            <label className="style-field">
              {brief.format === 'novel' ? '문체, 분위기' : '그림체, 연출'}
              <input
                value={brief.style}
                maxLength={200}
                required
                onChange={(event) => onBriefChange((current) => ({ ...current, style: event.target.value }))}
              />
            </label>
            <label>
              {brief.format === 'novel' ? '이번에 쓸 장' : brief.format === 'webtoon' ? '컷 수' : '장면 수'}
              <select
                value={brief.count}
                onChange={(event) =>
                  onBriefChange((current) => ({ ...current, count: Number(event.target.value) }))
                }
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((value) => (
                  <option key={value} value={value}>
                    {value}
                    {brief.format === 'novel' ? '개 장' : brief.format === 'webtoon' ? '컷' : '개 장면'}
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
                    onBriefChange((current) => ({
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
                    onBriefChange((current) => ({
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
            <button className="button primary generate-button" type="submit" disabled={!connected || busy}>
              <Sparkles size={16} /> 이야기 만들기 <ArrowRight size={16} />
            </button>
          </div>
        </fieldset>
      </form>
      {!connected && known && (
        <div className="setup-nudge">
          <span>
            {local ? '로컬 모델을 준비하면 시작할 수 있어요' : 'AI를 연결하면 창작을 시작할 수 있어요'}
          </span>
          <button className="text-button" onClick={onShowSettings}>
            연결 방법 보기 <ArrowRight size={13} />
          </button>
        </div>
      )}
    </section>
  );
}
