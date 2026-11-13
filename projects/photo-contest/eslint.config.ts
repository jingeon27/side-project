import { defineConfig } from 'eslint/config';

import { baseConfig, testFiles, tsconfigRootDir } from '@side/config/eslint/base';

// 미디어는 presigned URL로만 오가고 API는 파일 바이트를 읽거나 변환하지 않는다(AGENTS.md 미디어 결정).
const SERVER_MEDIA_PROCESSING = [
  'sharp',
  'image-size',
  'mediainfo.js',
  'fluent-ffmpeg',
  'ffmpeg-static',
  '@ffmpeg/*',
  'exifr',
  'piexifjs',
  'exiftool-vendored',
];

export default defineConfig([
  { ignores: ['apps/web/**', 'apps/mobile/**'] },
  ...baseConfig,
  tsconfigRootDir(import.meta.dirname),
  {
    name: 'photo-contest/api-no-server-media-processing',
    files: ['apps/api/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: SERVER_MEDIA_PROCESSING,
              message:
                'API는 미디어 파일을 처리하지 않습니다. presigned 조건과 HEAD로 검증합니다(projects/photo-contest/AGENTS.md).',
            },
          ],
        },
      ],
    },
  },
  {
    // 트랜잭션 콜백의 (tx ?? this.db)처럼 타입상 도달하지 않는 분기를 막는다. 콜백 시그니처가 바뀌면 쓰기가 조용히 트랜잭션 밖 연결로 간다.
    name: 'photo-contest/api-typed',
    files: ['apps/api/src/**/*.ts'],
    ignores: testFiles,
    languageOptions: { parserOptions: { projectService: true } },
    rules: { '@typescript-eslint/no-unnecessary-condition': 'error' },
  },
]);
