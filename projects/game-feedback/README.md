# Game Mate

**함께 게임할 사람을 찾는 일에서, 배우고 이야기를 나누는 일까지.**

친구 추가 판매와 코칭이라는 구상에서 시작한 게임 메이트 서비스입니다. 피드백·친추판매·전투 모집·게임코치·자유게시판과 영속 1:1 채팅을 제공합니다. 현재 제품 범위와 검증 한계는 [제품 문서](docs/product.md)와 [구현 기록](docs/implementation.md)을 기준으로 봅니다.

[웹 연결 주소](https://game.bambyul.com/ko) · [기능 안내](docs/features.md) · [개발 가이드](docs/development.md) · [운영 배포](../../deploy/shared-instance/README.md)

## 빠른 시작

저장소 루트에서 Node.js 24와 Yarn 4.17.0을 사용합니다. 최초 CLI 설치와 의존성 준비는 [루트 안내](../../README.md#빠른-시작)를 따릅니다.

```sh
cp projects/game-feedback/.env.example projects/game-feedback/.env
yarn workspace @side/game-feedback dev:test
```

- 웹 [localhost:3300/ko](http://localhost:3300/ko), API [localhost:4300](http://localhost:4300)
- 개발 DB 55442 · 테스트 DB 55444 · 모바일 Metro 8082
- `dev:test`는 예시 콘텐츠와 서버 테스트 토큰을 사용하는 로컬 검토용입니다. 운영 인증과 혼동하지 않습니다.
- 실제 제공자 연동은 프로젝트 `.env`를 설정한 뒤 `yarn workspace @side/game-feedback dev`로 시작합니다.
- Ctrl+C는 이 명령이 시작한 Web/API만 종료합니다. 개발 DB 중지는 `yarn workspace @side/game-feedback db:stop`입니다.

## 자주 쓰는 명령

모든 명령은 저장소 루트에서 실행합니다.

| 명령                                          | 용도                               |
| --------------------------------------------- | ---------------------------------- |
| `yarn workspace @side/game-feedback check`    | 계약·타입·lint                     |
| `yarn workspace @side/game-feedback test`     | API 통합 및 앱·패키지 단위/UI 검사 |
| `yarn workspace @side/game-feedback test:e2e` | 격리 DB·Web/Mobile 브라우저 검사   |
| `yarn workspace @side/game-feedback build`    | API/Web 빌드·모바일 export         |
| `yarn workspace @side/game-feedback codegen`  | Zod 계약 → OpenAPI → SDK           |

## 구조와 환경

| 경로                                 | 책임                                    |
| ------------------------------------ | --------------------------------------- |
| `apps/api`                           | NestJS REST · 인증·게시물·채팅 · Prisma |
| `apps/web`                           | Next.js · 한국어/영어 · 반응형 웹       |
| `apps/mobile`                        | Expo WebView · 앱 복귀·푸시 연결        |
| `packages/contracts`, `packages/sdk` | Zod 계약 · 생성 API 클라이언트          |
| `packages/bridge`                    | 앱↔웹 메시지 계약                       |

환경 파일은 `projects/game-feedback/.env` 하나에서 앱별로 전달합니다. 서버 키를 `NEXT_PUBLIC_*`에 넣지 않습니다. S3는 개발·통합 테스트도 실제 버킷을 사용하되 실행별 테스트 prefix만 정리합니다. [첨부 설정](docs/media-upload.md), [관측 설정](docs/observability.md), [환경변수 반영과 데이터 격리](docs/development.md)를 참고하세요.

운영은 EC2 공통 호스트에 배포하며 GitHub Environment `game-feedback-production`을 사용합니다. 테스트 로그인은 운영에서 활성화하지 않습니다. 배포 성공·외부 인증·관측 이벤트 수신은 각각 실제 결과를 확인해야 합니다.

## 문서

- [제품과 범위](docs/product.md)
- [구조와 데이터 흐름](docs/architecture.md)
- [REST 응답 Zod 검증·fallback 정책](packages/sdk/README.md)
- [구현 상태와 검증 범위](docs/implementation.md)
- [결정 기록](docs/decisions/0001-project-isolation.md)
- [Yarn 및 실행 방식](docs/decisions/0002-node-modules-runtime.md)
- [사용자가 제공한 MVP Plan v4.0 원문](docs/mvp-plan-v4.md)

사용자 모집, 실제 API 키와 출구 IP, 개인정보·약관 검토, 영어·일본어 공개 품질 검증은 코드 구현과 별도로 완료해야 한다.
