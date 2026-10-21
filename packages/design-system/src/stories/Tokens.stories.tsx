import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Foundations/Tokens',
  parameters: { controls: { disable: true } },
} satisfies Meta;

export default meta;
type TStory = StoryObj<typeof meta>;

const colors = [
  'canvas',
  'surface',
  'sunken',
  'ink',
  'muted',
  'subtle',
  'line',
  'line-strong',
  'brand',
  'brand-strong',
  'brand-soft',
  'on-brand',
  'accent',
  'accent-soft',
  'accent-ink',
  'on-accent',
  'danger',
  'danger-soft',
  'info',
  'info-soft',
  'neutral-soft',
  'gold',
  'silver',
  'bronze',
] as const;

export const Colors: TStory = {
  render: () => (
    <div className="grid grid-cols-2 gap-4 tablet:grid-cols-4 desktop:grid-cols-6">
      {colors.map((color) => (
        <div key={color} className="overflow-hidden rounded-card border border-line">
          <div className="h-20 border-b border-line" style={{ background: `var(--color-${color})` }} />
          <div className="p-3 text-caption">{color}</div>
        </div>
      ))}
    </div>
  ),
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
