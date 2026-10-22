import { withThemeByDataAttribute } from '@storybook/addon-themes';
import type { Preview, ReactRenderer } from '@storybook/react-vite';

import './preview.css';

const preview: Preview = {
  tags: ['autodocs'],
  decorators: [
    withThemeByDataAttribute<ReactRenderer>({
      themes: { light: 'light', dark: 'dark', system: 'system' },
      defaultTheme: 'light',
      attributeName: 'data-theme',
      parentSelector: 'html',
    }),
  ],
  parameters: {
    layout: 'padded',
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    // 위반을 실패로 다룬다. yarn test의 stories-a11y.spec.tsx가 모든 스토리를 axe로 검사한다.
    a11y: { test: 'error' },
    options: {
      storySort: {
        order: ['Foundations', 'Actions', 'Forms', 'Data display', 'Navigation', 'Overlays', 'Feedback'],
      },
    },
  },
};

export default preview;
