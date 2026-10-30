# 피식

메인 게시물 피드는 기존 `/`에서 이용합니다. 별도 서비스 소개(`/about`)와 이용 방법(`/about/how-it-works`)은 로그인 없이 열 수 있습니다. 소개 페이지의 ‘시작하기’는 기존 메인 인증 흐름으로 이어집니다. 비공개 그룹의 가입 승인과 게시물 접근 규칙은 그대로 적용합니다.

**사진과 영상, 웃긴 순간을 함께 나누는 그룹 커뮤니티.**

종료일 없이 유지되는 그룹에서 사진·영상·합성·유튜브와 일반 링크를 공유합니다. 공개 피드를 둘러보고 그룹에 참여하거나, 그룹 안에서 대회를 열어 투표하고 지난 결과를 돌아볼 수 있습니다.

[웹 연결 주소](https://contest.bambyul.com) · [기능 안내](docs/features.md) · [개발 가이드](docs/development.md) · [배포 안내](docs/deployment.md)

## 빠른 시작

저장소 루트에서 Node.js 24와 Yarn 4.17.0을 사용합니다. 최초 설치는 [루트 안내](../../README.md#빠른-시작)를 따릅니다.

```sh
cp projects/photo-contest/.env.example projects/photo-contest/.env
yarn workspace @side/photo-contest db:generate
yarn workspace @side/photo-contest codegen
yarn workspace @side/photo-contest db:local
```

별도 터미널에서 개발 DB에 마이그레이션을 적용하고 서버를 시작합니다.

```sh
yarn workspace @side/photo-contest db:migrate
yarn dev:photo-contest
```

- 웹 [localhost:3200](http://localhost:3200), API [127.0.0.1:4200](http://127.0.0.1:4200)
- 개발 DB 55432 · 테스트 DB 55434. `LOCAL_POSTGRES_PORT`와 DB URL을 함께 맞춥니다.
- 직접 아이디·비밀번호로 가입하거나 익명으로 시작합니다. 소셜 제공자 키는 필요하지 않습니다.
- 업로드는 로컬·통합·브라우저 테스트도 실제 AWS S3를 사용합니다. [권한·CORS·CI 설정](docs/post-attachments.md#검증)을 먼저 준비합니다.

## 자주 쓰는 명령

| 명령                                          | 용도                                |
| --------------------------------------------- | ----------------------------------- |
| `yarn workspace @side/photo-contest check`    | 프로젝트 타입·lint·계약 검사        |
| `yarn workspace @photo-contest/web test:unit` | 웹 단위·컴포넌트·배포 스크립트 검사 |
| `yarn test:photo-contest:api`                 | 웹·모바일이 소비하는 API 계약 검사  |
| `yarn test:photo-contest:e2e`                 | 격리 환경의 브라우저 검사           |
| `yarn build:photo-contest`                    | 프로덕션 빌드                       |

앱별 테스트 레인, 테스트 DB·포트와 정리 정책은 [개발 가이드](docs/development.md#앱별-테스트)에 있습니다. 실행 중인 다른 서버나 개발 DB를 테스트용으로 사용하지 않습니다.

## 구조와 운영

| 경로                | 책임                                            |
| ------------------- | ----------------------------------------------- |
| `apps/api`          | NestJS GraphQL · 세션·그룹·게시물·대회 · Prisma |
| `apps/web`          | Next.js · Apollo · 피드·그룹·대회 UI            |
| `apps/mobile`       | Expo WebView · 웹과 동일한 세션                 |
| `packages/bridge`   | 앱↔웹 계약                                      |
| `packages/test-kit` | 격리 DB·API·fixture 하네스                      |

EC2의 공통 Caddy·PostgreSQL을 Game Mate와 공유하지만 DB role·네트워크·환경변수는 분리합니다. 비공개 S3의 서비스별 prefix를 사용하며 API가 파일을 중계하지 않습니다. 운영 배포는 GitHub Environment `photo-contest-production`의 설정을 사용합니다.

## 문서 길잡이

- [화면·그룹·게시물·대회 기능](docs/features.md)
- [인증·스토리지·모바일·테스트](docs/development.md)
- [배포·마이그레이션·호환성](docs/deployment.md) · [공통 운영·롤백](../../deploy/shared-instance/README.md)
- [첨부와 다운로드](docs/post-attachments.md) · [SEO](docs/seo.md)
- [구현·검증 기록](docs/implementation.md) · [이전 단독 배포 기록](docs/deployment-legacy.md)

이용약관과 개인정보 처리방침은 검토용 초안입니다. 외부 서비스 설정·실제 보관 정책·법률 검토까지 완료된 것으로 보지 않습니다. 과거 배포 문서는 호환성 확인용 기록이며 현재 운영 순서는 공통 EC2 가이드를 따릅니다.
