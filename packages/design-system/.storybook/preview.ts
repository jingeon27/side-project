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
    a11y: { test: 'todo' },
    options: {
      storySort: {
        order: ['Foundations', 'Actions', 'Forms', 'Data display', 'Navigation', 'Overlays', 'Feedback'],
      },
    },
  },
};

export default preview;
