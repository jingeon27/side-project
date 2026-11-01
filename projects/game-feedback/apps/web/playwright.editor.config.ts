import { defineConfig, devices } from '@playwright/test';

import base from './playwright.config';

export default defineConfig({
  ...base,
  testMatch: ['**/editor-placeholder.test.ts', '**/tiptap-compatibility.spec.ts', '**/editor-media.spec.ts'],
  projects: [
    { name: 'editor-desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'editor-android-chromium', use: { ...devices['Pixel 5'] } },
    { name: 'editor-ios-webkit', use: { ...devices['iPhone 13'] } },
  ],
});
