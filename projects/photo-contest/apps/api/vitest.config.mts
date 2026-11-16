import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Nest DI는 데코레이터 메타데이터(design:paramtypes)에 의존하므로 esbuild 대신 swc로 TS를 변환한다.
const typescriptWithDecorators = swc.vite({
  include: /\.[cm]?ts$/,
  tsconfigFile: false,
  jsc: {
    parser: { syntax: 'typescript', decorators: true },
    transform: { legacyDecorator: true, decoratorMetadata: true },
    keepClassNames: true,
    target: 'es2022',
  },
});
const databaseOnly = process.argv.some(
  (argument) => argument === 'database' || argument === '--project=database',
);

export default defineConfig({
  plugins: [typescriptWithDecorators],
  test: {
    maxWorkers: '10%',
    projects: [
      ...(databaseOnly
        ? [
            {
              extends: true as const,
              test: {
                name: 'database',
                environment: 'node' as const,
                include: [
                  'src/**/*.database.integration.{spec,test}.ts',
                  'src/testing/testing.controller.integration.spec.ts',
                ],
                globalSetup: ['test/support/database-global-setup.ts'],
                setupFiles: ['test/support/setup.ts'],
                fileParallelism: false,
                testTimeout: 30_000,
                hookTimeout: 30_000,
              },
            },
          ]
        : []),
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.{spec,test}.ts'],
          exclude: ['src/**/*.integration.{spec,test}.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['src/**/*.integration.{spec,test}.ts'],
          globalSetup: ['test/support/global-setup.ts'],
          setupFiles: ['test/support/setup.ts'],
          // 파일들이 격리 스키마 하나를 함께 쓰므로 순서대로 실행한다.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
