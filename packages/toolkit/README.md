# @side/toolkit

여러 프로젝트에서 사용하는 도구와 서버 유틸리티입니다. 기능별 subpath로 가져옵니다.

- `@side/toolkit/push-notifications`: Expo 푸시 전송·메시지 검증. API가 소비하는 CommonJS와 타입 선언을 빌드합니다.
- `@side/toolkit/migration-check`: Prisma migration의 파괴적 DDL 검사. 루트 CLI에서 설치 전에도 실행할 수 있도록 Node.js 기본 모듈만 사용합니다.
- `@side/toolkit/sentry-check`: 서비스의 Sentry 이벤트 수집 확인. 환경변수 로딩과 실행 진입점은 각 API가 소유합니다.

`yarn workspace @side/toolkit check`로 lint·타입·단위 테스트를 실행하고, `yarn workspace @side/toolkit build`로 서버 런타임 코드를 빌드합니다.
