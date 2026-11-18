import type { TBrief, TFormat } from './story';

const formatStyles = {
  film: '자연스러운 한국 영화의 시네마틱 연출',
  drama: '자연스러운 한국 영화의 시네마틱 연출',
  animation: '따뜻한 수채화풍',
  webtoon: '선명한 한국 웹툰 작화',
  novel: '섬세한 감정 묘사와 자연스러운 한국어 문체',
} satisfies Record<TFormat, string>;

export const defaultBrief: TBrief = {
  format: 'animation',
  premise: '',
  genre: '판타지',
  style: formatStyles.animation,
  count: 3,
  ratio: '16:9',
  quality: 'draft',
  collections: [],
};

export function withFormat(brief: TBrief, format: TFormat): TBrief {
  return {
    ...brief,
    format,
    style: formatStyles[format],
    ratio: format === 'webtoon' ? '9:16' : brief.ratio,
  };
}
