import { configDefaults, defineConfig } from 'vitest/config';

// 실제 Python 모델 프로세스가 필요한 통합 검사는 단위 레인에서 빼고 test:integration으로만 실행한다.
const integration = 'src/**/*.integration.{spec,test}.ts';

export default defineConfig({
  test: {
    environment: 'node',
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.{spec,test}.ts'],
          exclude: [...configDefaults.exclude, integration],
        },
      },
      { extends: true, test: { name: 'integration', include: [integration] } },
    ],
  },
});
