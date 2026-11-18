import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Foundations/Tokens',
  parameters: { controls: { disable: true } },
} satisfies Meta;

export default meta;
type TStory = StoryObj<typeof meta>;

const accent = ['accent', '강조'] as const;
const groups = [
  {
    title: '브랜드와 강조',
    colors: [
      ['brand', '기본 행동'],
      ['brand-strong', '눌린 버튼'],
      ['on-brand', '브랜드 위 글자'],
      ['brand-soft', '브랜드 보조 배경'],
      accent,
      ['accent-soft', '선택 배경'],
      ['accent-ink', '강조 글자'],
      ['on-accent', '강조 위 글자'],
      ['accent-warm', '그라데이션 시작'],
      ['accent-pink', '그라데이션 끝'],
    ],
  },
  {
    title: '표면과 경계',
    colors: [
      ['canvas', '페이지 바탕'],
      ['surface', '카드와 입력창'],
      ['sunken', '안쪽 영역'],
      ['neutral-soft', '보조 배경'],
      ['line', '구분선'],
      ['line-strong', '뚜렷한 구분선'],
      ['control-border', '입력 경계'],
    ],
  },
  {
    title: '글자와 포커스',
    colors: [
      ['ink', '본문'],
      ['muted', '보조 글자'],
      ['subtle', '장식 아이콘'],
      ['focus-ring', '키보드 포커스'],
    ],
  },
  {
    title: '상태와 순위',
    colors: [
      ['danger', '오류'],
      ['danger-soft', '오류 배경'],
      ['info', '안내'],
      ['info-soft', '안내 배경'],
      ['gold', '금메달'],
      ['silver', '은메달'],
      ['bronze', '동메달'],
      ['on-medal', '메달 위 글자'],
    ],
  },
] as const;

type TSwatch = (typeof groups)[number]['colors'][number];

function ColorPalette() {
  const [selected, setSelected] = useState<TSwatch>(accent);
  return (
    <div className="mx-auto max-w-5xl bg-canvas p-4 text-ink tablet:p-9">
      <h1 className="mb-6 text-display">색상</h1>
      <div className="grid items-start gap-8 tablet:grid-cols-[minmax(12rem,1fr)_2fr]">
        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card tablet:sticky tablet:top-6">
          <div className="h-28 tablet:h-52" style={{ backgroundColor: `var(--color-${selected[0]})` }} />
          <div className="border-t border-line p-4 tablet:p-5" aria-live="polite" aria-atomic="true">
            <strong className="block text-title">{selected[1]}</strong>
            <code className="text-caption text-muted">--color-{selected[0]}</code>
          </div>
        </div>
        <div className="grid gap-8">
          {groups.map((group) => (
            <section key={group.title}>
              <h2 className="mb-3 text-subtitle">{group.title}</h2>
              <div className="grid grid-cols-2 gap-2">
                {group.colors.map((swatch) => (
                  <button
                    key={swatch[0]}
                    type="button"
                    aria-pressed={selected[0] === swatch[0]}
                    className="flex min-h-touch min-w-0 items-center gap-2.5 rounded-control border border-line bg-surface px-2.5 py-2 text-left hover:border-control-border aria-pressed:border-accent-ink aria-pressed:bg-accent-soft"
                    onClick={() => setSelected(swatch)}
                  >
                    <span
                      aria-hidden
                      className="size-6 shrink-0 rounded-badge border border-line-strong"
                      style={{ backgroundColor: `var(--color-${swatch[0]})` }}
                    />
                    <span className="min-w-0">
                      <span className="block text-label">{swatch[1]}</span>
                      <code className="block break-all text-caption text-muted">{swatch[0]}</code>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export const Colors: TStory = {
  render: () => <ColorPalette />,
};

const typography = [
  ['display', 'text-display'],
  ['title-lg', 'text-title-lg'],
  ['title', 'text-title'],
  ['subtitle', 'text-subtitle'],
  ['body', 'text-body'],
  ['input', 'text-input'],
  ['button', 'text-button'],
  ['label', 'text-label'],
  ['caption', 'text-caption'],
  ['micro', 'text-micro'],
] as const;

export const Typography: TStory = {
  render: () => (
    <div className="flex flex-col gap-6">
      {typography.map(([token, className]) => (
        <div key={token}>
          <div className="mb-1 text-caption text-muted">{token}</div>
          <p className={className}>함께 만드는 즐거운 경험 · Design system 0123456789</p>
        </div>
      ))}
    </div>
  ),
};
